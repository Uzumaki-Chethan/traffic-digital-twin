"""
db_logger.py
============
Lightweight SQLite persistence for the three runtime log tables:

    decision_log     one row per DecisionEngine decision (1 Hz)
    performance_log  one row per decision tick's network metrics
    prediction_log   one row per prediction, with the actual values
                     observed when its 15 s horizon elapsed

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
CREATE INDEX IF NOT EXISTS idx_decision_time ON decision_log(time);
CREATE INDEX IF NOT EXISTS idx_performance_time ON performance_log(time);
CREATE INDEX IF NOT EXISTS idx_prediction_time ON prediction_log(time);
"""


class DatabaseLogger:
    """
    SQLite sink for runtime logs. One instance per simulation run;
    constructed by app.py, closed in its finally block.
    """

    def __init__(self, db_path: str):
        self._db_path = db_path
        self._lock = threading.Lock()
        self._conn = None
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        try:
            self._conn = sqlite3.connect(db_path, check_same_thread=False)
            # WAL lets readers (e.g. a future dashboard history query)
            # proceed while the writer commits, instead of locking.
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.executescript(_SCHEMA)
            self._conn.commit()
            logger.info("Database ready at %s", db_path)
        except sqlite3.Error as exc:
            # A broken database degrades to logging-only; it must never
            # take down the control loop.
            logger.error("Database init failed (%s) - logging disabled.", exc)
            self._conn = None

    @property
    def is_enabled(self) -> bool:
        return self._conn is not None

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
                     mode: str, reason: str) -> None:
        """One row per DecisionEngine decision."""
        self._execute(
            "INSERT INTO decision_log (time, phase, duration, mode, reason) "
            "VALUES (?, ?, ?, ?, ?)",
            (time, phase, duration, mode, reason),
        )

    def log_performance(self, time: float, avg_wait: float, avg_speed: float,
                        queue_length: int, stopped: int) -> None:
        """One row per decision tick's network-wide metrics."""
        self._execute(
            "INSERT INTO performance_log "
            "(time, avg_wait, avg_speed, queue_length, stopped) "
            "VALUES (?, ?, ?, ?, ?)",
            (time, avg_wait, avg_speed, int(queue_length), int(stopped)),
        )

    def log_prediction(self, time: float, predicted_values: dict,
                       actual_values: dict, confidence: float) -> None:
        """One row per evaluated prediction (predicted vs actual)."""
        self._execute(
            "INSERT INTO prediction_log "
            "(time, predicted_values, actual_values, confidence) "
            "VALUES (?, ?, ?, ?)",
            (
                time,
                json.dumps(predicted_values),
                json.dumps(actual_values),
                float(confidence),
            ),
        )

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