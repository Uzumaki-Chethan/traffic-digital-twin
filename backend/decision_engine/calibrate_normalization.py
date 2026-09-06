"""
calibrate_normalization.py
=============================
Derives DecisionEngine's normalization ceilings (norm_vehicle_count,
norm_waiting_time_seconds) from recorded lane_state_log data instead
of leaving them at DecisionConfig's hardcoded starting-point defaults.
Those defaults were flagged in the original decision_engine.py as "the
first thing to tune once real Performance Evaluation metrics are
available" - this script is that tuning step, run manually and
deliberately, never wired into app.py's startup path. A bad or thin
calibration file must never silently change the running system's
behaviour without a human choosing to run this first.

METHOD
------
Reads every row from lane_state_log (data/traffic_dashboard.db by
default - override with --db-path) across however many runs have been
recorded so far, and takes the P-th percentile (default 90th) of
vehicle_count and avg_waiting_time as the new ceiling for each. A
percentile rather than the raw maximum is used deliberately: the max
is one outlier away from being a fluke (a single frozen frame during
an extreme scenario), whereas the 90th percentile represents "close to
saturated but still a real, recurring condition", which is what a
normalization ceiling should represent.

OUTPUT
------
backend/decision_engine/normalization_calibration.json (by default),
loaded automatically by DecisionEngine.__init__ on its next
construction if present (see decision_engine._load_default_config).
Deleting this file reverts to DecisionConfig()'s hardcoded defaults -
this is a strictly additive, optional layer, exactly like
ml/training/fit_confidence_calibration.py's calibrators.joblib.

USAGE
-----
    cd backend
    python -m decision_engine.calibrate_normalization
    python -m decision_engine.calibrate_normalization --percentile 95
"""

import argparse
import datetime
import json
import logging
import os
import sqlite3

import numpy as np

from config import Config
from decision_engine.decision_engine import DEFAULT_CALIBRATION_PATH

logger = logging.getLogger(__name__)

# Below this many recorded rows, a percentile is too noisy to trust -
# refuse to write a calibration file rather than lock in a fluke from a
# short or single run.
_MIN_ROWS_REQUIRED = 500


def _load_lane_state_columns(db_path: str):
    uri = "file:{}?mode=ro".format(db_path)
    conn = sqlite3.connect(uri, uri=True)
    try:
        return conn.execute(
            "SELECT vehicle_count, avg_waiting_time FROM lane_state_log"
        ).fetchall()
    finally:
        conn.close()


def calibrate(db_path: str, percentile: float, output_path: str) -> None:
    logger.info("Reading lane_state_log from %s...", db_path)
    try:
        rows = _load_lane_state_columns(db_path)
    except sqlite3.OperationalError as exc:
        logger.error(
            "Could not read %s (%s). Run the simulation at least once "
            "first so lane_state_log has data.", db_path, exc,
        )
        return

    if len(rows) < _MIN_ROWS_REQUIRED:
        logger.warning(
            "Only %d lane_state_log rows found (need at least %d) - "
            "refusing to calibrate from too little data. Run more/longer "
            "scenarios first, then re-run this script.",
            len(rows), _MIN_ROWS_REQUIRED,
        )
        return

    vehicle_counts = np.array([r[0] for r in rows], dtype=float)
    waiting_times = np.array([r[1] for r in rows], dtype=float)

    norm_vehicle_count = float(np.percentile(vehicle_counts, percentile))
    norm_waiting_time_seconds = float(np.percentile(waiting_times, percentile))

    logger.info(
        "P%.0f vehicle_count=%.2f, P%.0f avg_waiting_time=%.2f (from %d rows)",
        percentile, norm_vehicle_count, percentile, norm_waiting_time_seconds, len(rows),
    )

    payload = {
        "norm_vehicle_count": norm_vehicle_count,
        "norm_waiting_time_seconds": norm_waiting_time_seconds,
        "percentile": percentile,
        "computed_from_rows": len(rows),
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "source_db": os.path.abspath(db_path),
    }
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    logger.info("Wrote calibration to %s", output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-path", default=Config.DB_PATH, help="Path to traffic_dashboard.db")
    parser.add_argument(
        "--percentile", type=float, default=90.0,
        help="Percentile used as the normalization ceiling (default: 90)",
    )
    parser.add_argument(
        "--output-path", default=DEFAULT_CALIBRATION_PATH,
        help="Where to write the calibration JSON (default: next to decision_engine.py)",
    )
    args = parser.parse_args()
    calibrate(args.db_path, args.percentile, args.output_path)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    main()
