"""
db_logger.py
============
Lightweight SQLite persistence for the runtime log tables:

    decision_log     one row per DecisionEngine decision (1 Hz),
                     including the actual TraCI-confirmed phase/yellow
                     status alongside the desired one (see
                     _DECISION_LOG_MIGRATION_COLUMNS below)
    performance_log  one row per decision tick's network-wide metrics
    prediction_log   one row per prediction, with the actual values
                     observed when its 15 s horizon elapsed
    lane_state_log   one row PER LANE per decision tick (12 rows/tick):
                     the per-direction congestion breakdown that
                     performance_log's network-wide averages can't
                     show. Feeds backend/analytics/congestion_analytics.py.

DESIGN RULES
------------
- Writes are INSERT-only and fire once per decision tick. At 1 Hz this
  is microseconds of work per row; SQLite in WAL mode handles it without
  ever blocking the simulation loop meaningfully.
- The logger NEVER raises into the simulation: any database error is
  logged once and swallowed, because losing a log row must never cost a
  control tick.
- One connection, created lazily on first use, guarded by a lock so the
  dashboard server thread could safely read through it too if ever
  needed.
- This module contains no simulation logic and no TraCI - it is a pure
  persistence sink fed by app.py.
"""

import json
import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS decision_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    time     REAL NOT NULL,
    phase    TEXT NOT NULL,
    duration REAL NOT NULL,
    mode     TEXT NOT NULL,
    reason   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS performance_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    time        REAL NOT NULL,
    avg_wait    REAL NOT NULL,
    avg_speed   REAL NOT NULL,
    queue_length INTEGER NOT NULL,
    stopped     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prediction_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    time             REAL NOT NULL,
    predicted_values TEXT NOT NULL,
    actual_values    TEXT NOT NULL,
    confidence       REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS lane_state_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    time             REAL NOT NULL,
    lane_id          TEXT NOT NULL,
    vehicle_count    INTEGER NOT NULL,
    avg_speed        REAL NOT NULL,
    avg_waiting_time REAL NOT NULL,
    stopped_count    INTEGER NOT NULL,
    congestion_score REAL NOT NULL,
    signal_state     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decision_time ON decision_log(time);
CREATE INDEX IF NOT EXISTS idx_performance_time ON performance_log(time);
CREATE INDEX IF NOT EXISTS idx_prediction_time ON prediction_log(time);
CREATE INDEX IF NOT EXISTS idx_lane_state_time ON lane_state_log(time);
CREATE INDEX IF NOT EXISTS idx_lane_state_lane ON lane_state_log(lane_id);
"""

# decision_log started with only (time, phase, duration, mode, reason).
# These two columns were added later to persist the Desired-vs-Actual
# distinction durably (previously only visible live, via app.py's
# _signal_view(), never in SQLite). CREATE TABLE IF NOT EXISTS does not
# retrofit columns onto an already-existing table, so any database file
# created before this change needs an explicit ALTER TABLE - handled by
# _migrate_decision_log_columns() below, run once at startup.
_DECISION_LOG_MIGRATION_COLUMNS = {
    "actual_phase": "TEXT",
    "actual_is_yellow": "INTEGER",
    # 2026-09-17, for the Decisions page: the four phase scores and the
    # effective hysteresis margin of that tick (the score ledger needs
    # them to redraw a past decision), and the scenario the run played.
    "phase_scores": "TEXT",
    "margin": "REAL",
    "scenario": "TEXT",
}

# Every table carries the run its rows belong to (2026-09-17): the ISO
# UTC time the run started, which sorts chronologically as text. Older
# files gain the column by ALTER TABLE; their existing rows keep NULL
# and count as one "legacy" run, pruned first.
_TABLES = ("decision_log", "performance_log", "prediction_log", "lane_state_log")
_RUN_COLUMN = ("run_id", "TEXT")


class DatabaseLogger:
    """
    SQLite sink for runtime logs. One instance per simulation run;
    constructed by app.py, closed in its finally block.
    """

    def __init__(self, db_path: str, run_id: str = None, scenario: str = None):
        self._db_path = db_path
        self._lock = threading.Lock()
        self._conn = None
        # The run every row written through this logger belongs to, and
        # the scenario it played (stored on each decision row).
        self._run_id = run_id or datetime.now(timezone.utc).isoformat()
        self._scenario = scenario
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        try:
            self._conn = sqlite3.connect(db_path, check_same_thread=False)
            # WAL lets readers (e.g. a future dashboard history query)
            # proceed while the writer commits, instead of locking.
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.executescript(_SCHEMA)
            self._conn.commit()
            self._migrate_decision_log_columns()
            self._migrate_run_column()
            logger.info("Database ready at %s (run %s)", db_path, self._run_id)
        except sqlite3.Error as exc:
            # A broken database degrades to logging-only; it must never
            # take down the control loop.
            logger.error("Database init failed (%s) - logging disabled.", exc)
            self._conn = None

    @property
    def is_enabled(self) -> bool:
        return self._conn is not None

    @property
    def run_id(self) -> str:
        return self._run_id

    def _migrate_run_column(self) -> None:
        """Add run_id (and an index on it) to any table still without it."""
        if self._conn is None:
            return
        column, sql_type = _RUN_COLUMN
        try:
            for table in _TABLES:
                existing = {row[1] for row in self._conn.execute("PRAGMA table_info({})".format(table))}
                if column not in existing:
                    self._conn.execute("ALTER TABLE {} ADD COLUMN {} {}".format(table, column, sql_type))
                self._conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_{0}_run ON {0} ({1})".format(table, column)
                )
            self._conn.commit()
        except sqlite3.Error as exc:
            logger.error("run_id migration failed (%s) - rows this run carry no run id.", exc)

    def prune_runs(self, keep: int) -> int:
        """
        Delete every row belonging to a run older than the newest `keep`
        runs (this run counts as one of them, whether or not it has
        written anything yet). Rows with no run id - from before the
        column existed - are the oldest of all and go first. Returns the
        number of rows deleted. Called once, at the start of a run; a
        failure here is logged and the run goes on.
        """
        if self._conn is None or keep < 1:
            return 0
        try:
            with self._lock:
                ids = set()
                for table in _TABLES:
                    ids.update(
                        r[0] for r in self._conn.execute(
                            "SELECT DISTINCT run_id FROM {} WHERE run_id IS NOT NULL".format(table)
                        )
                    )
                ids.add(self._run_id)
                kept = sorted(ids)[-keep:]
                placeholders = ",".join("?" for _ in kept)
                deleted = 0
                for table in _TABLES:
                    cur = self._conn.execute(
                        "DELETE FROM {} WHERE run_id IS NULL OR run_id NOT IN ({})".format(table, placeholders),
                        tuple(kept),
                    )
                    deleted += cur.rowcount
                self._conn.commit()
                if deleted:
                    # Deleting rows does not shrink the file; give the
                    # space back so the database stays the size of the
                    # runs it holds (a second or two, once per run start).
                    self._conn.execute("VACUUM")
            if deleted:
                logger.info("Pruned %d rows from runs older than the newest %d.", deleted, keep)
            return deleted
        except sqlite3.Error as exc:
            logger.error("Pruning old runs failed (%s) - keeping everything.", exc)
            return 0

    def _migrate_decision_log_columns(self) -> None:
        """
        Adds any of _DECISION_LOG_MIGRATION_COLUMNS missing from an
        already-existing decision_log table (older database files
        created before this feature). A brand new database gets the
        base table from _SCHEMA and then these columns added
        immediately, so both paths converge on the same final shape.
        """
        if self._conn is None:
            return
        try:
            existing = {row[1] for row in self._conn.execute("PRAGMA table_info(decision_log)")}
            for column, sql_type in _DECISION_LOG_MIGRATION_COLUMNS.items():
                if column not in existing:
                    self._conn.execute(
                        "ALTER TABLE decision_log ADD COLUMN {} {}".format(column, sql_type)
                    )
            self._conn.commit()
        except sqlite3.Error as exc:
            logger.error(
                "decision_log column migration failed (%s) - actual-state "
                "columns unavailable this run.", exc,
            )

    def _execute(self, sql: str, params: tuple) -> None:
        if self._conn is None:
            return
        try:
            with self._lock:
                self._conn.execute(sql, params)
                self._conn.commit()
        except sqlite3.Error as exc:
            logger.error("Database write failed (%s) - row dropped.", exc)

    def log_decision(self, time: float, phase: str, duration: float,
                     mode: str, reason: str, actual_phase: str = None,
                     actual_is_yellow: bool = None, phase_scores: dict = None,
                     margin: float = None) -> None:
        """
        One row per DecisionEngine decision. actual_phase/actual_is_yellow
        are optional (default None) so existing callers keep working
        unchanged; app.py passes them from its own _signal_view(state) -
        the TraCI-confirmed reality, as opposed to `phase`/`mode`/`reason`
        which describe what was DESIRED.
        """
        self._execute(
            "INSERT INTO decision_log "
            "(time, phase, duration, mode, reason, actual_phase, actual_is_yellow, run_id, "
            "phase_scores, margin, scenario) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                time, phase, duration, mode, reason, actual_phase,
                None if actual_is_yellow is None else int(actual_is_yellow),
                self._run_id,
                None if phase_scores is None else json.dumps(
                    {k: round(float(v), 4) for k, v in phase_scores.items()}
                ),
                None if margin is None else float(margin),
                self._scenario,
            ),
        )

    def log_performance(self, time: float, avg_wait: float, avg_speed: float,
                        queue_length: int, stopped: int) -> None:
        """One row per decision tick's network-wide metrics."""
        self._execute(
            "INSERT INTO performance_log "
            "(time, avg_wait, avg_speed, queue_length, stopped, run_id) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (time, avg_wait, avg_speed, int(queue_length), int(stopped), self._run_id),
        )

    def log_prediction(self, time: float, predicted_values: dict,
                       actual_values: dict, confidence: float) -> None:
        """One row per evaluated prediction (predicted vs actual)."""
        self._execute(
            "INSERT INTO prediction_log "
            "(time, predicted_values, actual_values, confidence, run_id) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                time,
                json.dumps(predicted_values),
                json.dumps(actual_values),
                float(confidence),
                self._run_id,
            ),
        )

    def log_lane_states(self, time: float, rows) -> None:
        """
        One row PER LANE for one decision tick (12 rows/tick on this
        network). `rows` is an iterable of dicts with keys: lane_id,
        vehicle_count, avg_speed, avg_waiting_time, stopped_count,
        congestion_score, signal_state. Batched into a single
        transaction (executemany + one commit) so logging all 12 lanes
        costs one round-trip, not twelve.
        """
        if self._conn is None:
            return
        try:
            with self._lock:
                self._conn.executemany(
                    "INSERT INTO lane_state_log "
                    "(time, lane_id, vehicle_count, avg_speed, avg_waiting_time, "
                    "stopped_count, congestion_score, signal_state, run_id) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        (
                            time, r["lane_id"], int(r["vehicle_count"]),
                            float(r["avg_speed"]), float(r["avg_waiting_time"]),
                            int(r["stopped_count"]), float(r["congestion_score"]),
                            r["signal_state"],
                            self._run_id,
                        )
                        for r in rows
                    ],
                )
                self._conn.commit()
        except sqlite3.Error as exc:
            logger.error("Database write failed (%s) - lane_state_log rows dropped.", exc)

    def close(self) -> None:
        """Safe to call unconditionally from a finally block."""
        if self._conn is not None:
            try:
                with self._lock:
                    self._conn.close()
            except sqlite3.Error:
                pass
            finally:
                self._conn = None