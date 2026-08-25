"""
live_state.py
=============
The single hand-off point between the simulation process and the
read-only dashboard server.

The simulation loop (app.py, or PerformanceEvaluator in comparison mode)
PUBLISHES an immutable snapshot dict here once per decision tick; the
FastAPI dashboard thread READS the latest snapshot and pushes it to all
connected WebSocket clients. Nothing flows the other way - the dashboard
can never influence the simulation, which keeps the architecture rule
"the dashboard reads data, NEVER controls simulation" structurally true
rather than merely promised.

Thread-safety: one lock guards one reference swap. Publishing is O(1);
readers always see either the previous or the next complete snapshot,
never a half-updated one.
"""

import threading


class LiveStateStore:
    """
    Holds the most recent dashboard snapshot. One instance shared
    between the simulation thread (writer) and the server thread
    (reader).
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._snapshot = None

    def publish(self, snapshot: dict) -> None:
        """Atomically replace the latest snapshot (simulation side)."""
        with self._lock:
            self._snapshot = snapshot

    def latest(self):
        """
        Return the newest snapshot dict, or None if nothing has been
        published yet (server side).
        """
        with self._lock:
            return self._snapshot


# Module-level default store so any component (app.py, evaluator,
# dashboard server) can reach the same instance without wiring plumbing
# through every constructor. One process, one dashboard.
DEFAULT_STORE = LiveStateStore()