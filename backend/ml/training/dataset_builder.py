"""
dataset_builder.py
====================
Reads the raw per-run CSVs written by dataset_generator.py and produces
the final master_dataset_train.csv, master_dataset_test.csv, and
held_out_extreme.csv.

Critically, the chronological 80/20 split is performed PER RUN, on that
run's own rows in that run's own time order, before any concatenation
happens. Splitting after concatenation (either by row position or by
sorting on the raw simulation_time column across merged runs) would
either drop entire scenarios from the test set or interleave unrelated
runs that happen to share a timestamp, silently corrupting the
evaluation. See the architecture review for the full reasoning, this
module exists specifically to implement that reasoning correctly.

Pure data transformation, no SUMO or TraCI involvement of any kind, this
module only reads and writes CSV files.
"""

import csv
import glob
import logging
import os
from typing import Dict, List

from ml.training.config import TrainingConfig

logger = logging.getLogger(__name__)


def _read_csv_rows(path: str) -> List[Dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _write_csv_rows(path: str, rows: List[Dict[str, str]], fieldnames: List[str]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _split_run_rows(rows: List[Dict[str, str]], split_ratio: float):
    """
    Split one run's own rows, in their existing (already chronological,
    since dataset_generator.py writes them in observation order) order,
    into a train portion and a test portion.

    Splitting here, on one run's rows alone, before any concatenation
    with other runs, is what keeps this a genuinely chronological split
    per scenario trajectory rather than an arbitrary split across
    unrelated runs.
    """
    split_index = int(len(rows) * split_ratio)
    return rows[:split_index], rows[split_index:]


def build_datasets() -> None:
    """
    Read every raw per-run CSV, carve out the held-out scenario entirely,
    chronologically split every remaining run, and write the three final
    dataset files.
    """
    TrainingConfig.ensure_output_directories()

    raw_csv_paths = sorted(glob.glob(os.path.join(TrainingConfig.RAW_RUNS_DIR, "*.csv")))
    if not raw_csv_paths:
        raise FileNotFoundError(
            "No raw run CSVs found in {}. Run dataset_generator.generate_all() "
            "first.".format(TrainingConfig.RAW_RUNS_DIR)
        )

    train_rows: List[Dict[str, str]] = []
    test_rows: List[Dict[str, str]] = []
    held_out_rows: List[Dict[str, str]] = []
    fieldnames: List[str] = []

    for path in raw_csv_paths:
        rows = _read_csv_rows(path)
        if not rows:
            logger.warning("Run CSV %s has no rows, skipping.", path)
            continue

        if not fieldnames:
            fieldnames = list(rows[0].keys())

        scenario_name = rows[0]["scenario_name"]

        if scenario_name == TrainingConfig.HELD_OUT_SCENARIO_NAME:
            held_out_rows.extend(rows)
            continue

        run_train_rows, run_test_rows = _split_run_rows(
            rows, TrainingConfig.CHRONOLOGICAL_SPLIT_RATIO
        )
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
        "Datasets built: %d train rows, %d test rows, %d held-out rows.",
        len(train_rows), len(test_rows), len(held_out_rows),
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    build_datasets()