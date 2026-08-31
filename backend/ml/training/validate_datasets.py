"""
validate_datasets.py
======================
Read-only validation over the raw per-run CSVs written by
dataset_generator.py, run after generation (and again after
dataset_builder.py) to catch exactly the failure modes that produced
the previous dataset's quality problems:

  - incomplete runs (missing scenario/seed combinations entirely)
  - duplicate (run_id, simulation_time) rows within a run
  - missing/empty values in any column
  - a feature or target vector that isn't the expected fixed length
    (125 features, 24 targets - imported from feature_schema, not
    hard-coded here, so this can never silently drift out of sync with
    the schema both MLPredictor and the training pipeline share)
  - values outside a realistic physical range for their column

This module only reads CSVs and imports column names/counts from
ml.feature_schema; it does not import anything from TraCI/SUMO, so it
can run without a SUMO installation, and it does not modify
feature_schema.py or duplicate anything dataset_builder.py already does
(dataset_builder.py's empty-file skip is about which rows go into which
split; this catches structural problems dataset_builder.py isn't
responsible for detecting).

Usage
-----
    cd backend
    python -m ml.training.validate_datasets
    python -m ml.training.validate_datasets --strict   # exit(1) on any issue
"""

import argparse
import csv
import glob
import logging
import os
from typing import Dict, List

from ml.feature_schema import (
    EXPECTED_LANE_IDS,
    LANE_FEATURE_NAMES,
    NETWORK_FEATURE_NAMES,
    TARGET_FEATURE_NAMES,
)
from ml.training.config import TrainingConfig
from ml.training.scenario_manifest import SCENARIOS

logger = logging.getLogger(__name__)

_IDENTITY_COLUMNS = ["run_id", "scenario_name", "seed", "simulation_time", "target_time"]
_N_FEATURE_COLUMNS = len(NETWORK_FEATURE_NAMES) + len(EXPECTED_LANE_IDS) * len(LANE_FEATURE_NAMES)
_N_TARGET_COLUMNS = len(EXPECTED_LANE_IDS) * len(TARGET_FEATURE_NAMES)
_EXPECTED_TOTAL_COLUMNS = len(_IDENTITY_COLUMNS) + _N_FEATURE_COLUMNS + _N_TARGET_COLUMNS

# Realistic per-column-name range checks. Keyed on the bare feature/
# target name (the part after the "<lane_id>__" prefix, or the network
# column name as-is) since the same physical quantity repeats once per
# lane plus once network-wide. Bounds are deliberately generous (this
# is a sanity check for broken data, e.g. a negative count or a
# nonsensical speed, not a tight statistical outlier filter) and are
# grounded in this project's own known constants:
#   - speeds: vehicle_types.add.xml's fastest maxSpeed is the bus/car
#     class around 13.9 m/s (50 km/h); 40 m/s is a generous ceiling.
#   - current_signal_state: FeatureEngineer encodes this as an ordinal
#     0/1/2 (see the architecture handoff notes), never a raw phase
#     index.
#   - seconds_until_next_signal_switch: bounded by the longest cycle
#     documented for intersection.tll.xml, ~96-110s; 200s is a
#     generous ceiling that would still catch a unit error.
_RANGE_CHECKS = {
    "vehicle_count": (0, 200),
    "total_vehicle_count": (0, 400),
    "average_speed": (0.0, 40.0),
    "average_waiting_time": (0.0, 3600.0),
    "max_waiting_time": (0.0, 3600.0),
    "stopped_vehicle_count": (0, 200),
    "stopped_vehicle_count_trend": (-200, 200),
    "waiting_time_trend": (-3600.0, 3600.0),
    "arrival_rate": (0.0, 50.0),
    "departure_rate": (0.0, 50.0),
    "current_signal_state": (0, 2),
    "seconds_until_next_signal_switch": (0.0, 200.0),
}


def _bare_column_name(column: str) -> str:
    """
    '<lane_id>__vehicle_count' -> 'vehicle_count',
    '<lane_id>__target__vehicle_count' -> 'vehicle_count',
    'total_vehicle_count' -> 'total_vehicle_count' (network columns
    have no lane prefix to begin with).
    """
    parts = column.split("__")
    return parts[-1]


def _check_expected_runs_present() -> List[str]:
    """Every (scenario, seed) in the manifest should have a raw CSV."""
    issues = []
    for scenario in SCENARIOS:
        for seed in scenario.seeds:
            run_id = "{}_seed{}".format(scenario.name, seed)
            path = os.path.join(TrainingConfig.RAW_RUNS_DIR, "{}.csv".format(run_id))
            if not os.path.isfile(path):
                issues.append("MISSING run: {} (expected at {})".format(run_id, path))
    return issues


def _validate_single_csv(path: str) -> List[str]:
    issues = []
    filename = os.path.basename(path)

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames
        if header is None:
            return ["{}: file is empty (no header row)".format(filename)]
        if len(header) != _EXPECTED_TOTAL_COLUMNS:
            issues.append(
                "{}: header has {} columns, expected {} ({} identity + "
                "{} feature + {} target)".format(
                    filename, len(header), _EXPECTED_TOTAL_COLUMNS,
                    len(_IDENTITY_COLUMNS), _N_FEATURE_COLUMNS, _N_TARGET_COLUMNS,
                )
            )

        seen_sim_times = set()
        row_count = 0
        for line_number, row in enumerate(reader, start=2):
            row_count += 1

            # Ragged row: csv.DictReader puts overflow fields under the
            # None key, or leaves named fields as None if the row was
            # short. Either is a structurally broken row.
            if None in row or any(v is None for v in row.values()):
                issues.append(
                    "{}: line {} has the wrong number of fields "
                    "(malformed/truncated row)".format(filename, line_number)
                )
                continue

            # Missing/empty values in any column.
            empty_columns = [k for k, v in row.items() if v == ""]
            if empty_columns:
                issues.append(
                    "{}: line {} has empty value(s) in {}".format(
                        filename, line_number, empty_columns
                    )
                )

            # Duplicate timestamp within this run.
            sim_time = row.get("simulation_time")
            if sim_time is not None:
                if sim_time in seen_sim_times:
                    issues.append(
                        "{}: line {} duplicates simulation_time={} "
                        "already seen in this run".format(filename, line_number, sim_time)
                    )
                seen_sim_times.add(sim_time)

            # Realistic range checks, wherever we have a bound defined.
            for column, raw_value in row.items():
                bare_name = _bare_column_name(column)
                bounds = _RANGE_CHECKS.get(bare_name)
                if bounds is None:
                    continue
                try:
                    value = float(raw_value)
                except (TypeError, ValueError):
                    issues.append(
                        "{}: line {} column '{}' has non-numeric value '{}'".format(
                            filename, line_number, column, raw_value
                        )
                    )
                    continue
                low, high = bounds
                if not (low <= value <= high):
                    issues.append(
                        "{}: line {} column '{}' = {} is outside the realistic "
                        "range [{}, {}]".format(
                            filename, line_number, column, value, low, high
                        )
                    )

        if row_count == 0:
            issues.append("{}: header present but zero data rows".format(filename))

    return issues


def validate_all() -> List[str]:
    """
    Run every check across every raw CSV in TrainingConfig.RAW_RUNS_DIR
    plus the manifest-completeness check. Returns the full list of
    issues found (empty list means everything passed).
    """
    all_issues: List[str] = []
    all_issues.extend(_check_expected_runs_present())

    csv_paths = sorted(glob.glob(os.path.join(TrainingConfig.RAW_RUNS_DIR, "*.csv")))
    if not csv_paths:
        all_issues.append(
            "No raw run CSVs found in {} at all.".format(TrainingConfig.RAW_RUNS_DIR)
        )
    for path in csv_paths:
        all_issues.extend(_validate_single_csv(path))

    return all_issues


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Validate raw per-run training CSVs for completeness, "
                     "structural integrity, and realistic value ranges."
    )
    parser.add_argument(
        "--strict", action="store_true",
        help="Exit with status 1 if any issue is found (useful in a script/CI step).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    issues = validate_all()
    if not issues:
        logger.info("Validation passed: no issues found across all raw run CSVs.")
    else:
        logger.warning("Validation found %d issue(s):", len(issues))
        for issue in issues:
            logger.warning("  - %s", issue)
        if args.strict:
            raise SystemExit(1)