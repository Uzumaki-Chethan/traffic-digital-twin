"""
Every log row belongs to a run, and a new run prunes runs older than the
newest DB_KEEP_RUNS (2026-09-17). Offline, on a temporary database.
"""
import sqlite3
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from database.db_logger import DatabaseLogger  # noqa: E402
from analytics.congestion_analytics import average_wait_times, latest_run_id  # noqa: E402


def _write_run(db_path, run_id, wait):
    log = DatabaseLogger(db_path, run_id=run_id)
    log.log_decision(1.0, "NS_right", 5.0, "priority", "r")
    log.log_performance(1.0, wait, 5.0, 1, 1)
    log.log_lane_states(1.0, [{
        "lane_id": "N_in_0", "vehicle_count": 1, "avg_speed": 1.0, "avg_waiting_time": wait,
        "stopped_count": 0, "congestion_score": 0.1, "signal_state": "G",
    }])
    log.close()


def test_rows_carry_their_run_and_reads_default_to_the_latest(tmp_path):
    db = str(tmp_path / "t.db")
    _write_run(db, "2026-09-17T10:00:00+00:00", wait=2.0)
    _write_run(db, "2026-09-17T11:00:00+00:00", wait=8.0)

    conn = sqlite3.connect(db)
    assert {r[0] for r in conn.execute("SELECT DISTINCT run_id FROM decision_log")} == {
        "2026-09-17T10:00:00+00:00", "2026-09-17T11:00:00+00:00",
    }
    assert latest_run_id(conn) == "2026-09-17T11:00:00+00:00"
    conn.close()

    # Analytics answer for the newest run only, unless told otherwise.
    assert average_wait_times(db)["average_wait_seconds"] == 8.0
    assert average_wait_times(db, run_id="2026-09-17T10:00:00+00:00")["average_wait_seconds"] == 2.0
    assert average_wait_times(db, run_id=None)["average_wait_seconds"] == 5.0


def test_a_new_run_prunes_runs_older_than_the_newest_n(tmp_path):
    db = str(tmp_path / "t.db")
    for h in range(5):
        _write_run(db, "2026-09-17T0{}:00:00+00:00".format(h), wait=1.0)
    # A legacy row with no run id at all - the oldest of all.
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO decision_log (time, phase, duration, mode, reason) VALUES (0, 'p', 1, 'm', 'r')")
    conn.commit()
    conn.close()

    new = DatabaseLogger(db, run_id="2026-09-17T09:00:00+00:00")
    deleted = new.prune_runs(keep=3)  # the new run + the two newest old ones survive
    new.close()
    assert deleted > 0

    conn = sqlite3.connect(db)
    kept = sorted(r[0] for r in conn.execute("SELECT DISTINCT run_id FROM decision_log"))
    assert kept == ["2026-09-17T03:00:00+00:00", "2026-09-17T04:00:00+00:00"]
    assert conn.execute("SELECT COUNT(*) FROM decision_log WHERE run_id IS NULL").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM lane_state_log").fetchone()[0] == 2
    conn.close()


def test_decision_rows_keep_scores_margin_and_scenario_for_the_ledger(tmp_path):
    db = str(tmp_path / "t.db")
    log = DatabaseLogger(db, run_id="2026-09-17T12:00:00+00:00", scenario="heavy_seed1")
    log.log_decision(3.05, "NS_right", 2.0, "priority", "why", actual_phase="NS_right",
                     actual_is_yellow=False, phase_scores={"NS_right": 0.123456, "EW_right": 0.5}, margin=0.37)
    log.close()
    conn = sqlite3.connect(db)
    row = conn.execute("SELECT phase_scores, margin, scenario FROM decision_log").fetchone()
    conn.close()
    assert row[0] == '{"NS_right": 0.1235, "EW_right": 0.5}' and row[1] == 0.37 and row[2] == "heavy_seed1"
