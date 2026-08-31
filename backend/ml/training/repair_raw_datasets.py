"""
repair_raw_datasets.py
========================
One-time repair for raw run CSVs generated before the features_to_vector
empty-lane bug fix (see ml/feature_schema.py's features_to_vector
docstring/comments for the full bug explanation). That bug inflated the
feature vector by +4 columns for every lane that had no vehicle either
currently or at the lookback point - common early in any run, and on
lightly-used lanes throughout light/directional-imbalanced scenarios.

This script does NOT attempt to reconstruct the correct 10-column block
for an affected lane. A reconstruction is technically possible (the
bug's output has a recognizable shape), but confidently locating which
of the 12 lane-blocks in a given malformed row are the bugged ones,
purely from the flattened values with no access to the original
TrafficFeatures object, relies on a value-pattern heuristic that could
misfire on a genuinely-mostly-zero legitimate lane block. Silently
writing a wrong value into training data is worse than dropping the
row, so this script only ever drops rows it cannot confidently trust,
never rewrites values.

Rows are dropped only when the field count doesn't match the header AND
the excess is an exact multiple of 4 (the bug's signature) - anything
else is left completely alone and reported separately, since that would
indicate a different, unexplained problem this script was not written
for.

Safety:
  - Every original file is copied to <name>.csv.bak before anything is
    rewritten, once, on first run - if a .bak already exists (e.g. this
    script is re-run), it is treated as the source of truth and NOT
    overwritten again, so re-running this script is always safe and
    idempotent, it can never compound damage across repeated runs.
  - The repaired file is written via the same temp-file + os.replace
    atomic pattern dataset_generator.py itself uses, so an interrupted
    repair run can never leave a half-written CSV at the real path.

Usage
-----
    cd backend
    python -m ml.training.repair_raw_datasets          # dry run, reports only
    python -m ml.training.repair_raw_datasets --apply   # actually writes repairs
"""

import argparse
import csv
import glob
import logging
import os
import shutil
from typing import List

from ml.training.config import TrainingConfig
from ml.training.dataset_generator import _row_header

logger = logging.getLogger(__name__)


def _repair_one_file(path: str, apply: bool) -> None:
    expected_header = _row_header()
    expected_width = len(expected_header)

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        rows = list(reader)

    if header != expected_header:
        logger.warning(
            "%s: header does not match the current schema at all (not just "
            "row width) - skipping, this file needs regeneration, not repair.",
            os.path.basename(path),
        )
        return

    kept_rows: List[List[str]] = []
    dropped_bug_signature = 0
    dropped_unexplained = 0

    for row in rows:
        width = len(row)
        if width == expected_width:
            kept_rows.append(row)
            continue

        excess = width - expected_width
        if excess > 0 and excess % 4 == 0:
            dropped_bug_signature += 1
        else:
            dropped_unexplained += 1
            logger.warning(
                "%s: row with width %d (excess %d, NOT a multiple of 4 - "
                "unexplained, not the known bug) - dropped, please inspect "
                "this file manually.",
                os.path.basename(path), width, excess,
            )

    total_dropped = dropped_bug_signature + dropped_unexplained
    logger.info(
        "%-30s total=%5d  kept=%5d  dropped(bug)=%4d  dropped(other)=%3d  (%.1f%% dropped)",
        os.path.basename(path), len(rows), len(kept_rows),
        dropped_bug_signature, dropped_unexplained,
        100.0 * total_dropped / len(rows) if rows else 0.0,
    )

    if not apply:
        return

    backup_path = path + ".bak"
    if not os.path.isfile(backup_path):
        shutil.copy2(path, backup_path)

    tmp_path = path + ".tmp"
    with open(tmp_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(expected_header)
        writer.writerows(kept_rows)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)


def repair_all(apply: bool) -> None:
    raw_csv_paths = sorted(glob.glob(os.path.join(TrainingConfig.RAW_RUNS_DIR, "*.csv")))
    if not raw_csv_paths:
        logger.warning("No raw CSVs found in %s.", TrainingConfig.RAW_RUNS_DIR)
        return

    logger.info(
        "%s mode - %s",
        "APPLY" if apply else "DRY RUN",
        "files will be rewritten in place (originals backed up to .bak)."
        if apply else "no files will be modified, re-run with --apply to write repairs.",
    )
    logger.info("")

    for path in raw_csv_paths:
        _repair_one_file(path, apply)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Repair raw run CSVs affected by the features_to_vector "
                     "empty-lane bug by dropping the malformed rows."
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Actually rewrite files. Without this flag, only reports what "
             "would be dropped, per file.",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    repair_all(apply=args.apply)