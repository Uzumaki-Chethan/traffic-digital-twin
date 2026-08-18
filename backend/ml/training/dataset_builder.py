"""
dataset_builder.py
====================
Reads the raw per-run CSVs written by dataset_generator.py and produces
the final master_dataset_train.csv, master_dataset_test.csv, and
held_out.csv.

Critically, the chronological 80/20 split is performed PER RUN, on that
run's own rows in that run's own time order, before any concatenation
happens. Splitting after concatenation (either by row position or by
sorting on the raw simulation_time column across merged runs) would
either drop entire scenarios from the test set or interleave unrelated
runs that happen to share a timestamp, silently corrupting the
evaluation. See the architecture review for the full reasoning, this
module exists specifically to implement that reasoning correctly.

Second training milestone additions, both aimed at making the
train/test/held-out split scientifically defensible, not merely
productive of a high confidence number:

1. Embargo gap at the train/test boundary (see _split_run_rows). A
   plain chronological split leaves a subtle overlap: the LAST training
   row's target describes traffic state PREDICTION_HORIZON_SECONDS
   after its own feature time, which can land after the FIRST test
   row's feature time (since consecutive rows are only
   SAMPLING_INTERVAL_SECONDS apart, and the horizon is much larger than
   that). That means a training label can describe a moment in time
   later than an early test row's own input - not classic leakage (no
   test row's exact input/output pair is seen during training), but a
   real, avoidable temporal overlap in a continuous, autocorrelated
   process. Standard practice in time-series ML (the "embargo" /
   "purged" cross-validation pattern) is to drop a gap of at least one
   horizon's worth of rows at the boundary rather than use them at all.
   That is what _split_run_rows now does.

2. Seed-level held-out runs (see _held_out_seed_lookup), in addition to
   the existing fully-held-out scenario (extreme). accident and
   emergency_response are included in training (see
   scenario_manifest.py for why - the model needs practical exposure to
   these patterns, since Performance Evaluation benchmarks VAC vs AI on
   exactly these scenario types), but one seed of each
   (Scenario.held_out_seeds) is excluded from train/test entirely and
   routed into the same held-out bucket as extreme. This is what makes
   held-out evaluation on those scenario types meaningful: a
   chronological test split from the SAME accident run only shows the
   model learned to continue that one specific run, not that it
   generalizes to a fresh accident instance (different seed, different
   exact arrival pattern) it never trained on at all.

Pure data transformation, no SUMO or TraCI involvement of any kind, this
module only reads and writes CSV files.
"""

import csv
import glob
import logging
import math
import os
from typing import Dict, List, Set, Tuple

from ml.feature_schema import PREDICTION_HORIZON_SECONDS
from ml.training.config import TrainingConfig
from ml.training.scenario_manifest import SCENARIOS

logger = logging.getLogger(__name__)

# Rows dropped at the train/test boundary of every run, see the module
# docstring's embargo-gap explanation. Computed from the real horizon
# and sampling interval, not hardcoded, so this can never silently
# drift out of sync if either of those ever changes. math.ceil, not a
# plain division, so the gap is always at least a full horizon even
# when the horizon is not an exact multiple of the sampling interval.
_EMBARGO_ROWS = math.ceil(
    PREDICTION_HORIZON_SECONDS / TrainingConfig.SAMPLING_INTERVAL_SECONDS
)


def _held_out_seed_lookup() -> Dict[str, Set[int]]:
    """
    Build a {scenario_name: {held-out seeds}} lookup from the manifest,
    once, rather than importing scenario_manifest's dataclass shape
    into every call site that needs this.
    """
    return {scenario.name: set(scenario.held_out_seeds) for scenario in SCENARIOS}


def _read_csv_rows(path: str) -> List[Dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _write_csv_rows(path: str, rows: List[Dict[str, str]], fieldnames: List[str]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _split_run_rows(
    rows: List[Dict[str, str]], split_ratio: float
) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    """
    Split one run's own rows, in their existing (already chronological,
    since dataset_generator.py writes them in observation order) order,
    into a train portion and a test portion, with an embargo gap of
    _EMBARGO_ROWS dropped between them (see module docstring).

    Splitting here, on one run's rows alone, before any concatenation
    with other runs, is what keeps this a genuinely chronological split
    per scenario trajectory rather than an arbitrary split across
    unrelated runs.

    If a run has too few rows to leave a meaningful train and test
    portion after the embargo gap, everything before the gap goes to
    train and nothing to test for that run, rather than raising - a
    handful of short runs should not crash the whole build, and every
    other run still contributes correctly to both splits.
    """
    split_index = int(len(rows) * split_ratio)
    train_end = split_index
    test_start = split_index + _EMBARGO_ROWS

    if test_start >= len(rows):
        # Not enough rows after the embargo gap for any test portion -
        # keep everything before the (now moot) gap as train.
        return rows[:split_index] if split_index > 0 else rows, []

    return rows[:train_end], rows[test_start:]


def build_datasets() -> None:
    """
    Read every raw per-run CSV, carve out the held-out scenario and any
    seed-level held-out runs entirely, chronologically split every
    remaining run (with an embargo gap), and write the three final
    dataset files.
    """
    TrainingConfig.ensure_output_directories()

    raw_csv_paths = sorted(glob.glob(os.path.join(TrainingConfig.RAW_RUNS_DIR, "*.csv")))
    if not raw_csv_paths:
        raise FileNotFoundError(
            "No raw run CSVs found in {}. Run dataset_generator.generate_all() "
            "first.".format(TrainingConfig.RAW_RUNS_DIR)
        )

    held_out_seed_lookup = _held_out_seed_lookup()

    train_rows: List[Dict[str, str]] = []
    test_rows: List[Dict[str, str]] = []
    held_out_rows: List[Dict[str, str]] = []
    fieldnames: List[str] = []

    embargoed_row_total = 0

    for path in raw_csv_paths:
        rows = _read_csv_rows(path)
        if not rows:
            logger.warning("Run CSV %s has no rows, skipping.", path)
            continue

        if not fieldnames:
            fieldnames = list(rows[0].keys())

        scenario_name = rows[0]["scenario_name"]
        seed = int(rows[0]["seed"])

        is_fully_held_out_scenario = scenario_name == TrainingConfig.HELD_OUT_SCENARIO_NAME
        is_held_out_seed = seed in held_out_seed_lookup.get(scenario_name, set())

        if is_fully_held_out_scenario or is_held_out_seed:
            held_out_rows.extend(rows)
            continue

        run_train_rows, run_test_rows = _split_run_rows(
            rows, TrainingConfig.CHRONOLOGICAL_SPLIT_RATIO
        )
        embargoed_row_total += len(rows) - len(run_train_rows) - len(run_test_rows)
        train_rows.extend(run_train_rows)
        test_rows.extend(run_test_rows)

    if not fieldnames:
        raise ValueError(
            "Every raw run CSV was empty, cannot determine a column schema."
        )

    _write_csv_rows(TrainingConfig.TRAIN_DATASET_PATH, train_rows, fieldnames)
    _write_csv_rows(TrainingConfig.TEST_DATASET_PATH, test_rows, fieldnames)
    _write_csv_rows(TrainingConfig.HELD_OUT_DATASET_PATH, held_out_rows, fieldnames)

    logger.info(
        "Datasets built: %d train rows, %d test rows, %d held-out rows "
        "(%d rows dropped total to the %d-row embargo gap at each run's "
        "train/test boundary).",
        len(train_rows), len(test_rows), len(held_out_rows),
        embargoed_row_total, _EMBARGO_ROWS,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    build_datasets()