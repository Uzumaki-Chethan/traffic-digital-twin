"""
sim_supervisor.py
=================
Owns the lifecycle of the live simulation on behalf of the console
(server.py): start it, pause it, stop it, start another one - all from
the browser, with no terminal command in between.

WHY A THREAD AND NOT A CHILD PROCESS. The evaluator is launched as a
real subprocess (see control_routes.py) because it genuinely is a
separate program with its own two SUMO instances. A live run is not: it
publishes into the very LiveStateStore this server reads from, and its
RunControl is the very object the pause/resume endpoints hold. Running
it in-process makes both of those a direct reference instead of an HTTP
round trip, so pause is instant and there is no cross-process state to
keep in sync. TraCI is happy with this - it is a socket client, and the
evaluator already drives two labeled connections from one process.

WHAT IT PROTECTS AGAINST. One run at a time (a second SUMO on the same
TraCI label would fight the first), a crash inside the simulation
thread taking the console down with it (it is caught and reported, and
the console keeps serving the recorded database), and a stale "running"
state after a run ends on its own - SUMO window closed, scenario
finished, or the user pressing Stop.

The dashboard's read-only guarantee is untouched: this never publishes,
never reads a snapshot, and nothing in dashboard_server.py can reach it.
Only control_routes.py, mounted deliberately by server.py, can.
"""

import logging
import os
import tempfile
import threading
from datetime import datetime, timezone

from performance.scenarios import DEFAULT_SCENARIO, is_known_scenario, scenario_sumocfg_path
from services.run_control import RunControl

logger = logging.getLogger(__name__)


class SimulationSupervisor:
    """
    One live simulation at a time, run on a worker thread.

    `run_control` is created once and reused across runs (reset on each
    start) because the control endpoints capture it at router-build time
    and must keep pointing at whatever is currently running.
    """

    def __init__(self, store, runner=None, evaluation_runner=None):
        self._store = store
        # Injected for tests; the real runners import the whole SUMO
        # pipeline, which a unit test has no reason to pull in.
        self._runner = runner
        # An evaluation (Trinetra vs a baseline, two SUMO instances in
        # lockstep) runs on the SAME worker slot as a demo run, with the
        # same RunControl and the same store - which is what makes the
        # console's one top bar drive either. Signature:
        # evaluation_runner(store, control, scenario_name, baseline).
        self._evaluation_runner = evaluation_runner
        # What the worker is running: "demo" | "evaluation" | None, and
        # which scenario. Reported by run-state so the pages know whose
        # frames are on the wire.
        self._kind = None
        self._scenario = None
        self._lock = threading.Lock()
        self._thread = None
        self._gui = False
        self._started_at = None
        self._ended_at = None
        self._error = None
        self.run_control = RunControl()

    # ---- state ----------------------------------------------------------

    def is_running(self) -> bool:
        thread = self._thread
        return thread is not None and thread.is_alive()

    def status_dict(self) -> dict:
        running = self.is_running()
        state = self.run_control.status_dict()
        if not running:
            # "Paused" and "stopping" are properties of a run in progress.
            # RunControl keeps its stop flag set until the next reset(), so
            # reporting it raw here would leave the UI saying "Stopping..."
            # forever after a run had already finished.
            state["paused"] = False
            state["stopping"] = False
        return {
            "managed": True,
            "running": running,
            "can_start": not running,
            "kind": self._kind if running else None,
            "scenario": self._scenario,
            "gui": self._gui,
            "started_at": self._started_at,
            "ended_at": None if running else self._ended_at,
            # Whatever killed the last run, in plain text, so the UI can
            # say what happened instead of just going quiet. Cleared by
            # the next successful start.
            "error": self._error,
            **state,
        }

    # ---- control --------------------------------------------------------

    def _refuse_if_busy(self) -> None:
        if self.is_running():
            raise RuntimeError(
                "An evaluation is active — stop it first."
                if self._kind == "evaluation" else
                "A demo run is active — stop it first."
            )

    def start(self, gui: bool = False, scenario_name=None) -> dict:
        """
        Launch a demo simulation. `scenario_name` picks a scenario from
        the library (performance.scenarios); None runs the production
        route. Raises RuntimeError if anything is already up - the caller
        turns that into a 409 - and ValueError for an unknown scenario.
        """
        scenario = scenario_name or DEFAULT_SCENARIO
        if not is_known_scenario(scenario):
            raise ValueError("Unknown scenario {!r}".format(scenario))
        sumocfg = None if scenario == DEFAULT_SCENARIO else scenario_sumocfg_path(scenario)
        with self._lock:
            self._refuse_if_busy()

            self.run_control.reset()
            self._kind = "demo"
            self._scenario = scenario
            self._gui = bool(gui)
            self._started_at = datetime.now(timezone.utc).isoformat()
            self._ended_at = None
            self._error = None
            self._thread = threading.Thread(
                target=self._run, args=(bool(gui), None, sumocfg),
                name="live-simulation", daemon=True,
            )
            self._thread.start()
            logger.info("Started live simulation (gui=%s, scenario=%s).", gui, scenario)
            return self.status_dict()

    def start_evaluation(self, scenario_name: str, baseline: str = "vac") -> dict:
        """
        Launch Trinetra-vs-baseline on this worker, headless, with the
        same RunControl the top bar holds. Same refusals as start().
        """
        if not is_known_scenario(scenario_name) or scenario_name == DEFAULT_SCENARIO:
            raise ValueError("Unknown scenario {!r}".format(scenario_name))
        if baseline not in ("vac", "fixed_timer"):
            raise ValueError("Unknown baseline {!r}".format(baseline))
        with self._lock:
            self._refuse_if_busy()

            self.run_control.reset()
            self._kind = "evaluation"
            self._scenario = scenario_name
            self._gui = False
            self._started_at = datetime.now(timezone.utc).isoformat()
            self._ended_at = None
            self._error = None
            self._thread = threading.Thread(
                target=self._run_evaluation, args=(scenario_name, baseline),
                name="live-evaluation", daemon=True,
            )
            self._thread.start()
            logger.info("Started evaluation (scenario=%s, baseline=%s).", scenario_name, baseline)
            return self.status_dict()

    def open_gui(self) -> dict:
        """
        Continue THIS run in a SUMO window. The run saves its state and
        ends, and the same worker thread immediately restarts it from
        that state with sumo-gui - so the vehicles, the signal and the
        clock all carry over. Verified to round-trip exactly; the visible
        cost is a couple of seconds while SUMO relaunches.
        """
        if not self.is_running():
            raise RuntimeError("No simulation is running to open a window for.")
        if self._kind == "evaluation":
            raise RuntimeError("Only a demo run can be opened in a SUMO window.")
        if self._gui:
            raise RuntimeError("This run already has a SUMO window.")
        path = os.path.join(tempfile.gettempdir(), "trinetra_handover_state.xml")
        self.run_control.request_handover(path)
        logger.info("GUI handover requested; state will be saved to %s", path)
        return self.status_dict()

    def stop(self) -> dict:
        """
        Ask the run to finish after the current step. Deliberately a
        request, not a kill: the runner's own finally block still closes
        TraCI and the database cleanly, so SUMO exits rather than being
        orphaned.
        """
        if not self.is_running():
            return {"stopped": False, **self.status_dict()}
        self.run_control.request_stop()
        logger.info("Stop requested for the live simulation.")
        return {"stopped": True, **self.status_dict()}

    def join(self, timeout=None) -> None:
        """Wait for the current run to finish (shutdown, and tests)."""
        thread = self._thread
        if thread is not None:
            thread.join(timeout)

    # ---- worker ---------------------------------------------------------

    def _run_evaluation(self, scenario_name: str, baseline: str) -> None:
        runner = self._evaluation_runner
        if runner is None:
            # Lazy for the same reason as the demo runner below.
            from performance.evaluator import PerformanceEvaluator

            def runner(store, control, scenario_name, baseline):
                evaluator = PerformanceEvaluator(scenario_name, use_gui=False, baseline=baseline)
                result = evaluator.run(live_store=store, control=control)
                # Same artefact a terminal run leaves behind.
                PerformanceEvaluator.save_csv(result)

        try:
            runner(self._store, self.run_control, scenario_name, baseline)
        except BaseException as exc:  # noqa: BLE001 - reported, never swallowed
            self._error = "{}: {}".format(type(exc).__name__, exc)
            logger.exception("Evaluation ended with an error.")
        finally:
            self._ended_at = datetime.now(timezone.utc).isoformat()
            logger.info("Evaluation thread finished.")

    def _run(self, gui: bool, load_state, sumocfg=None) -> None:
        runner = self._runner
        if runner is None:
            # Imported here, not at module scope: this pulls in the
            # entire SUMO/TraCI/ML pipeline, and a console that never
            # starts a run should not pay for it (nor fail to boot on a
            # machine with no SUMO installed).
            from simulation_runner import run_simulation as runner

        try:
            # This loops only for a GUI handover: the run saves its state
            # and ends, then the SAME thread restarts it from that state
            # in a window. is_running() therefore stays true throughout,
            # which is what makes it read as one continuous run.
            while True:
                try:
                    runner(self._store, self.run_control, gui=gui, load_state=load_state,
                           sumocfg=sumocfg)
                except BaseException as exc:  # noqa: BLE001 - reported, never swallowed
                    # Includes SystemExit/KeyboardInterrupt deliberately:
                    # this is a worker thread, and whatever ends it must
                    # be visible in the UI rather than lost with it.
                    self._error = "{}: {}".format(type(exc).__name__, exc)
                    logger.exception("Live simulation ended with an error.")
                    return

                path = self.run_control.handover_path
                if not (self.run_control.handover_requested and path and os.path.isfile(path)):
                    return
                logger.info("Resuming the run in sumo-gui from %s", path)
                load_state = path
                gui = True
                self._gui = True
                self.run_control.reset()
        finally:
            self._ended_at = datetime.now(timezone.utc).isoformat()
            logger.info("Live simulation thread finished.")
