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

RemoteLiveStatePublisher (below) is a cross-PROCESS counterpart with the
identical publish(snapshot) interface: a performance.evaluator run
launched by app.py's control layer (see services/control_routes.py) is
a genuinely separate OS process, sharing no memory with app.py's own
LiveStateStore instance, so it publishes over a local HTTP POST instead
of a direct method call. This does not weaken the rule above - it is
still always a SIMULATION process publishing, never the dashboard/
viewer publishing into itself; the dashboard side of this relationship
is completely unchanged.
"""

import json
import logging
import threading
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)


class LiveStateStore:
    """
    Holds the most recent dashboard snapshot. One instance shared
    between the simulation thread (writer) and the server thread
    (reader).
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._snapshot = None
        # Bumped on every publish() and clear(), so a reader can tell a
        # NEW frame from the one it already sent without comparing dicts.
        self._version = 0

    def publish(self, snapshot: dict) -> None:
        """Atomically replace the latest snapshot (simulation side)."""
        with self._lock:
            self._snapshot = snapshot
            self._version += 1

    def latest_versioned(self):
        """(snapshot or None, version) - one atomic read for a broadcaster."""
        with self._lock:
            return self._snapshot, self._version

    def latest(self):
        """
        Return the newest snapshot dict, or None if nothing has been
        published yet (server side).
        """
        with self._lock:
            return self._snapshot

    def clear(self) -> None:
        """
        Forget the last snapshot. Called when a NEW run starts, so the
        dashboard is not shown the previous run's final picture (and its
        vehicles) for the seconds until the new run's first tick.
        """
        with self._lock:
            self._snapshot = None
            self._version += 1


# Module-level default store so any component (app.py, evaluator,
# dashboard server) can reach the same instance without wiring plumbing
# through every constructor. One process, one dashboard.
DEFAULT_STORE = LiveStateStore()


class RemoteLiveStatePublisher:
    """
    Publishes snapshots to another process's LiveStateStore over HTTP,
    via the control layer's POST /api/internal/publish endpoint (see
    services/control_routes.py). Used by performance/evaluator.py's
    main() only when launched as a controlled child process
    (PUSH_TO_CONTROL_URL set) - a direct terminal run never constructs
    this and behaves exactly as it always has.

    publish() is NON-BLOCKING: it hands the snapshot to a background
    daemon thread and returns immediately, the same "a side-channel must
    never cost a control tick" rule database.DatabaseLogger already
    follows for SQLite writes. A synchronous version was replaced with
    this before shipping, purely on that principle (a blocking network
    call on the simulation's own thread is the wrong shape regardless
    of measured impact) - a later timing comparison found the bulk of a
    light_seed1 run's ~120s wall-clock time is intrinsic to running two
    lockstep SUMO/TraCI instances for ~850 simulated seconds, present
    even with no publishing at all, not caused by the HTTP call. The
    non-blocking design is kept anyway: it removes a real (if smaller
    than first assumed) risk at negligible cost.

    Only the LATEST not-yet-sent snapshot is ever kept (a single slot,
    not a growing queue): if the sender thread falls behind, older
    unsent snapshots are simply superseded, exactly mirroring
    LiveStateStore.publish()'s own "atomically replace the latest"
    semantics - a stale intermediate snapshot has no value once a newer
    one exists.

    Failure-tolerant by design, the same rule database.DatabaseLogger
    already follows: a dropped or slow publish must never affect the
    simulation it's reporting on. Every exception is caught and logged
    at DEBUG (not raised, not even WARNING - a single missed tick during
    a network hiccup is invisible noise, the next one arrives in ~1s).
    """

    def __init__(self, control_url: str, timeout_seconds: float = 1.5):
        self._publish_url = control_url.rstrip("/") + "/api/internal/publish"
        self._timeout_seconds = timeout_seconds
        self._pending = None
        self._condition = threading.Condition()
        self._worker = threading.Thread(
            target=self._run, name="remote-live-state-publisher", daemon=True,
        )
        self._worker.start()

    def publish(self, snapshot: dict) -> None:
        """Hand off to the background sender thread; never blocks on I/O."""
        with self._condition:
            self._pending = snapshot
            self._condition.notify()

    def _run(self) -> None:
        while True:
            with self._condition:
                while self._pending is None:
                    self._condition.wait()
                snapshot = self._pending
                self._pending = None
            self._send(snapshot)

    def _send(self, snapshot: dict) -> None:
        try:
            body = json.dumps(snapshot).encode("utf-8")
            request = urllib.request.Request(
                self._publish_url, data=body,
                headers={"Content-Type": "application/json"}, method="POST",
            )
            urllib.request.urlopen(request, timeout=self._timeout_seconds).close()
        except (urllib.error.URLError, OSError, ValueError) as exc:
            logger.debug("Remote publish to %s failed (%s) - snapshot dropped.",
                         self._publish_url, exc)