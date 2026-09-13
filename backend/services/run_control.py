"""
run_control.py
===============
The live simulation's run state: paused, running, asked to stop - and
how fast it is allowed to advance.

Why this is its own module rather than a flag on TraCIManager or app.py:
the run loop is the one thing a web request must be able to influence
(pause, resume, stop, speed), and every other control path in this
project is deliberately quarantined away from `dashboard_server.py` so
that file's "pure viewer, zero endpoints that can influence the
simulation" claim stays literally true. This object is the shared state;
the endpoints that write it live in `control_routes.py`, which only
`app.py` and `server.py` mount.

It owns nothing about SUMO or TraCI and imports neither, so it is
trivially testable and cannot break a run by existing.

PACING (added 2026-09-12): a headless `sumo` run steps as fast as the
machine allows - roughly a hundred times real time - which makes the
live dashboard a blur and floods its rolling history with a hundred
samples a second. Since the browser can now launch a run itself (see
services/sim_supervisor.py), something has to decide how fast "playing"
means, and the run loop is the only place that can: it is the thing
calling simulationStep(). `pace()` is therefore called once per step and
sleeps just enough to keep simulated time tracking wall-clock time at
`speed` x real time. sumo-gui's own Delay slider does the same job for a
GUI run started by hand; this makes the behaviour identical either way,
and `set_speed(None)` restores the old flat-out behaviour for anyone who
wants a scenario over with as fast as possible.

Threading: the dashboard server runs in a daemon thread while the
simulation steps on another, so the two touch this from different
threads. A `threading.Event` is used rather than a bare bool because it
gives a blocking `wait()` - a paused run parks on the event instead of
spinning a busy loop burning CPU through a demo.
"""

import threading
import time

# Granularity of pacing sleeps. Long enough that the sleep loop costs
# nothing, short enough that a pause, stop or speed change is acted on
# within a frame rather than at the end of one long sleep.
_SLEEP_SLICE_SECONDS = 0.02

# How far behind schedule the loop may fall before pacing gives up on
# catching the lost time back. Without this, a slow patch (or a machine
# that was busy elsewhere) would make the simulation sprint afterwards to
# "make up" for it, which looks like a glitch rather than a correction.
_MAX_LAG_SECONDS = 1.0


class RunControl:
    """
    Shared pause / stop / speed state for one simulation run.

    The simulation side calls `wait_if_paused()` and `pace()` once per
    step and checks `stop_requested`; the web side calls `pause()`,
    `resume()`, `request_stop()` and `set_speed()`. Nothing here blocks
    the web side.
    """

    def __init__(self, speed: float = 1.0):
        # Set == "may proceed". Starts set, so a run that never touches
        # this behaves exactly as it did before this module existed.
        self._proceed = threading.Event()
        self._proceed.set()
        self._stop = threading.Event()
        # Handover: save the simulation state and end this run so the
        # supervisor can immediately resume it in sumo-gui. SUMO cannot
        # attach a GUI to a process already running, so continuing the
        # SAME simulation in a window means saving and reloading it.
        self._handover = threading.Event()
        self._handover_path = None

        # Pacing state. `_anchor_wall` is None whenever the schedule needs
        # rebuilding from the next step (start, resume, speed change).
        self._lock = threading.Lock()
        self._speed = self._clean_speed(speed)
        self._anchor_wall = None
        self._anchor_sim = 0.0
        self._sim_elapsed = 0.0

    # ---- read by either side -------------------------------------------

    @property
    def paused(self) -> bool:
        return not self._proceed.is_set()

    @property
    def stop_requested(self) -> bool:
        return self._stop.is_set()

    @property
    def handover_requested(self) -> bool:
        return self._handover.is_set()

    @property
    def handover_path(self):
        return self._handover_path

    @property
    def speed(self):
        """Simulated seconds per wall-clock second, or None for unthrottled."""
        with self._lock:
            return self._speed

    def status_dict(self) -> dict:
        return {
            "paused": self.paused,
            "stopping": self.stop_requested,
            "handing_over": self.handover_requested,
            "speed": self.speed,
        }

    # ---- called by the web side -----------------------------------------

    def pause(self) -> None:
        self._proceed.clear()

    def resume(self) -> None:
        # Drop the pacing anchor: simulated time did not advance while
        # paused, and without this the loop would try to catch up on the
        # entire pause afterwards at full speed.
        self._drop_anchor()
        self._proceed.set()

    def request_stop(self) -> None:
        # Release a paused run first, or it would sit on the event
        # forever and never notice it had been asked to stop.
        self._stop.set()
        self._proceed.set()

    def request_handover(self, state_path: str) -> None:
        """
        Ask the run to save its state and end, so it can be resumed in a
        SUMO window. Releases a paused run first, exactly as
        request_stop() does, or it would never notice.
        """
        self._handover_path = state_path
        self._handover.set()
        self._proceed.set()

    def cancel_handover(self) -> None:
        """Called by the run loop if saving the state actually failed."""
        self._handover.clear()
        self._handover_path = None

    def set_speed(self, multiplier) -> None:
        """
        Set simulated seconds per wall-clock second. None (or anything
        non-positive) means unthrottled: step as fast as the machine can.
        """
        with self._lock:
            self._speed = self._clean_speed(multiplier)
            self._anchor_wall = None

    def reset(self) -> None:
        """
        Return to a clean "running, nothing requested" state so one
        RunControl can serve a second run (see SimulationSupervisor,
        which reuses the instance the control endpoints already hold).
        """
        self._stop.clear()
        self._proceed.set()
        self._handover.clear()
        self._handover_path = None
        with self._lock:
            self._anchor_wall = None
            self._anchor_sim = 0.0
            self._sim_elapsed = 0.0

    # ---- called by the simulation side ----------------------------------

    def wait_if_paused(self, poll_seconds: float = 0.1) -> None:
        """
        Block while paused. Returns immediately when running, and returns
        promptly once `request_stop()` is called even mid-pause.

        The timeout makes the wait interruptible rather than indefinite,
        so a stop request can never leave the run loop wedged.
        """
        while not self._proceed.is_set():
            if self._stop.is_set():
                return
            self._proceed.wait(poll_seconds)

    def pace(self, step_seconds: float) -> None:
        """
        Sleep for whatever is left of this step's real-time budget.

        Called once per simulation step with the simulation's own step
        length, so this needs no TraCI call of its own and no knowledge
        of what is being simulated. Returns immediately when unthrottled,
        when already behind schedule, or when a pause/stop lands mid-sleep.
        """
        with self._lock:
            self._sim_elapsed += step_seconds
            if self._speed is None:
                self._anchor_wall = None
                return
            if self._anchor_wall is None:
                # First step of a fresh schedule: this is now t=0.
                self._anchor_wall = time.monotonic()
                self._anchor_sim = self._sim_elapsed
                return
            due = self._anchor_wall + (self._sim_elapsed - self._anchor_sim) / self._speed

        while True:
            remaining = due - time.monotonic()
            if remaining <= 0:
                break
            if self._stop.is_set() or not self._proceed.is_set():
                # Pausing or stopping mid-sleep: let the loop deal with it
                # rather than finishing a sleep nobody is waiting for.
                self._drop_anchor()
                return
            time.sleep(min(remaining, _SLEEP_SLICE_SECONDS))

        if time.monotonic() - due > _MAX_LAG_SECONDS:
            # Too far behind to catch up honestly - restart the schedule
            # from here instead of sprinting through the backlog.
            self._drop_anchor()

    # ---- internals -------------------------------------------------------

    @staticmethod
    def _clean_speed(multiplier):
        if multiplier is None:
            return None
        try:
            value = float(multiplier)
        except (TypeError, ValueError):
            return 1.0
        return value if value > 0 else None

    def _drop_anchor(self) -> None:
        with self._lock:
            self._anchor_wall = None
