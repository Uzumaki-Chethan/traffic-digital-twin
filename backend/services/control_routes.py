"""
control_routes.py
==================
The ONLY module in this project that lets a web request affect what
process is running - deliberately kept separate from
services/dashboard_server.py so that file's own "pure viewer, no POST,
no control socket" claim about itself stays literally true.
`build_control_router()` is called once, by app.py or server.py only,
when it starts its dashboard server; performance/evaluator.py's own
standalone --dashboard run never mounts this, so a spawned evaluator's
dashboard (if it even starts one - see below) can never itself spawn
further evaluators.

WHAT CAN BE CONTROLLED, AND BY WHICH ENTRY POINT:
  pause / resume / stop / speed   wherever a run loop is attached
                                  (`run_control`) - app.py and server.py
  start-simulation                server.py only (`supervisor`), because
                                  app.py IS the run and cannot host a
                                  second one
  start-evaluator / stop-evaluator  either; a real child process

WHAT THIS ACTUALLY LAUNCHES: `python -m performance.evaluator --scenario
... --baseline ... [--gui]`, as a genuinely separate OS process (its own
two SUMO/TraCI connections, isolated from app.py's own simulation) -
never the ML DecisionEngine's control loop directly, and never
arbitrary user-supplied commands: scenario_name is checked against
real .sumocfg files and baseline against a fixed whitelist before
either ever reaches subprocess.Popen's argv.

HOW THE CHILD'S LIVE DATA GETS BACK HERE: the child is launched with
PUSH_TO_CONTROL_URL set in its environment; evaluator.py's main() sees
that and publishes over HTTP to POST /api/internal/publish below,
which forwards straight into the SAME LiveStateStore app.py's own live
loop publishes into - see services/live_state.py's module docstring for
why this doesn't weaken the dashboard's read-only guarantee.

WINDOWS PROCESS LIFECYCLE: launched with CREATE_NEW_PROCESS_GROUP so a
later stop can send CTRL_BREAK_EVENT - this raises KeyboardInterrupt in
the child exactly like a terminal Ctrl+C would, letting evaluator.py's
own try/finally (manager_ai.close()/manager_base.close()) run its
normal clean TraCI/SUMO shutdown rather than leaving orphaned sumo.exe
processes behind. A hard kill() is only the last-resort fallback.
"""

import logging
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import Config
from performance.evaluator import BASELINE_CONTROLLERS
from performance.scenarios import is_known_scenario, known_scenario_names
from services.live_state import LiveStateStore

logger = logging.getLogger(__name__)

_BACKEND_DIR = os.path.join(Config.PROJECT_ROOT, "backend")

# How long to wait for a graceful CTRL_BREAK_EVENT shutdown before
# escalating to a hard kill. SUMO + TraCI teardown is normally
# sub-second; this is a generous margin, not a tight budget.
_GRACEFUL_STOP_TIMEOUT_SECONDS = 10.0


class StartEvaluatorRequest(BaseModel):
    scenario_name: str
    baseline: str = "fixed_timer"
    gui: bool = False


class StartSimulationRequest(BaseModel):
    """
    gui=False launches headless `sumo` - the console draws the junction
    itself, so a SUMO window is optional rather than the only way to
    watch. gui=True opens sumo-gui alongside it. scenario_name picks a
    scenario from the library (performance.scenarios); omitted, the run
    is the production route.
    """
    gui: bool = False
    scenario_name: Optional[str] = None


class StartEvaluationRequest(BaseModel):
    """
    Trinetra vs a baseline on the SAME scenario, two SUMO instances in
    lockstep, run in-process by the supervisor so the top bar's
    pause/stop/speed drive it. Always headless. The UI sends "vac".
    """
    scenario_name: str
    baseline: str = "vac"


class DispatchRequest(BaseModel):
    """
    One emergency vehicle into the running simulation: which kind, which
    approach it enters from, and which way it turns at the junction. The
    route id is derived here from the network's own twelve routes - the
    request never names a route or a lane directly.
    """
    vehicle_type: str = "ambulance"
    approach: str = "N"
    turn: str = "straight"


# The library's emergency vTypes (sumo/vehicles/vehicle_types.add.xml) and
# the network's turn geometry: left-hand traffic, so from the North arm
# (travelling south) a left turn goes East.
DISPATCH_TYPES = ("ambulance", "fire_engine", "police_vehicle")
_LEFT_OF = {"N": "E", "S": "W", "E": "S", "W": "N"}
_OPPOSITE = {"N": "S", "S": "N", "E": "W", "W": "E"}


def dispatch_route_id(approach: str, turn: str) -> str:
    """'route_N_E' for approach N turning left, and so on."""
    if approach not in _OPPOSITE:
        raise ValueError("approach must be one of N, S, E, W")
    if turn == "left":
        to = _LEFT_OF[approach]
    elif turn == "straight":
        to = _OPPOSITE[approach]
    elif turn == "right":
        to = _LEFT_OF[_OPPOSITE[approach]]
    else:
        raise ValueError("turn must be left, straight or right")
    return "route_{}_{}".format(approach, to)


class SpeedRequest(BaseModel):
    """
    Simulated seconds per wall-clock second. null means unthrottled -
    run the scenario as fast as the machine manages.
    """
    multiplier: Optional[float] = None


class _TrackedRun:
    """One evaluator subprocess this control layer launched, if any."""

    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
        self.scenario_name: Optional[str] = None
        self.baseline: Optional[str] = None
        self.gui: bool = False
        self.started_at: Optional[str] = None

    def is_running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def clear(self) -> None:
        self.process = None
        self.scenario_name = None
        self.baseline = None
        self.gui = False
        self.started_at = None

    def status_dict(self) -> dict:
        running = self.is_running()
        if not running and self.process is not None:
            # The process exited on its own (scenario finished) since
            # the last status check - self-heal rather than reporting
            # stale "running" state forever.
            self.clear()
        return {
            "running": running,
            "scenario_name": self.scenario_name,
            "baseline": self.baseline,
            "gui": self.gui,
            "started_at": self.started_at,
        }


def build_control_router(store: LiveStateStore, run_control=None,
                         supervisor=None) -> APIRouter:
    """
    Build the control API, bound to `store` - the SAME LiveStateStore
    the calling process's own simulation loop publishes into (app.py
    passes its LIVE_STATE). Called once, from app.py or server.py only.

    `run_control` is the optional services.run_control.RunControl shared
    with this process's own run loop. When given, the pause/resume/stop/
    speed endpoints below are live; when omitted they report unavailable
    rather than pretending, so a dashboard started by the evaluator
    (which has no run loop of its own to pause) degrades honestly.

    `supervisor` is the optional services.sim_supervisor.SimulationSupervisor
    that can START a run. Only server.py passes one, because only server.py
    outlives a simulation: app.py IS the run, so it has nothing to start.
    Duck-typed on purpose - this module never imports the supervisor, which
    keeps the whole SUMO pipeline out of the import graph of a dashboard
    that may never launch anything.
    """
    router = APIRouter()
    tracked = _TrackedRun()

    def _run_state_dict() -> dict:
        if run_control is None:
            return {"available": False, "managed": False, "running": False,
                    "can_start": False, "paused": False, "stopping": False,
                    "speed": None}
        if supervisor is not None:
            return {"available": True, **supervisor.status_dict()}
        # A run loop with no supervisor is app.py: the process only exists
        # because a simulation is already running, and it cannot start
        # another - so "running, not startable" is the honest answer.
        return {
            "available": True, "managed": False,
            "running": not run_control.stop_requested,
            "can_start": False,
            **run_control.status_dict(),
        }

    @router.get("/api/control/run-state")
    async def run_state():
        return _run_state_dict()

    def _require_run_control(verb: str):
        if run_control is None:
            raise HTTPException(
                status_code=409,
                detail="This dashboard is not attached to a run loop it can "
                       "{}.".format(verb),
            )

    @router.post("/api/control/pause")
    async def pause_run():
        _require_run_control("pause")
        run_control.pause()
        return _run_state_dict()

    @router.post("/api/control/resume")
    async def resume_run():
        _require_run_control("resume")
        run_control.resume()
        return _run_state_dict()

    @router.post("/api/control/stop")
    async def stop_run():
        """
        Ask the simulation to finish after the current step. Deliberately
        a request, not a kill: the runner's own finally block still runs,
        so TraCI and the database close cleanly.
        """
        _require_run_control("stop")
        run_control.request_stop()
        return _run_state_dict()

    @router.post("/api/control/speed")
    async def set_speed(body: SpeedRequest):
        """
        How fast "playing" means: simulated seconds per wall-clock second.
        Needed because a headless run has no Delay slider of its own and
        would otherwise step at ~100x real time the moment it starts.
        """
        _require_run_control("re-pace")
        run_control.set_speed(body.multiplier)
        return _run_state_dict()

    @router.post("/api/control/dispatch")
    async def dispatch(body: DispatchRequest):
        """
        Send an emergency vehicle into the run that is on now, from the
        chosen approach, turning the chosen way. Refused when nothing is
        running. On an evaluation it enters both simulations at once.
        """
        _require_run_control("dispatch into")
        if body.vehicle_type not in DISPATCH_TYPES:
            raise HTTPException(status_code=400, detail="Unknown emergency vehicle type.")
        try:
            route_id = dispatch_route_id(body.approach, body.turn)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        state = _run_state_dict()
        if not state.get("running"):
            raise HTTPException(status_code=409, detail="Nothing is running to dispatch into.")
        n = run_control.request_dispatch(body.vehicle_type, route_id)
        return {"dispatched": n, "vehicle_type": body.vehicle_type, "route": route_id, **_run_state_dict()}

    @router.post("/api/control/start-simulation")
    async def start_simulation(body: StartSimulationRequest):
        """
        Start a live AI-controlled run. Available only where something
        outlives the simulation to host it - i.e. server.py, which is
        the entry point that passes a supervisor.
        """
        if supervisor is None:
            raise HTTPException(
                status_code=409,
                detail="This dashboard cannot start a simulation: it is running "
                       "inside one. Use server.py for a console that can.",
            )
        if body.scenario_name is not None and not is_known_scenario(body.scenario_name):
            raise HTTPException(
                status_code=400,
                detail="Unknown scenario {!r}.".format(body.scenario_name),
            )
        try:
            return supervisor.start(gui=body.gui, scenario_name=body.scenario_name)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @router.post("/api/control/start-evaluation")
    async def start_evaluation(body: StartEvaluationRequest):
        """
        Start Trinetra-vs-baseline in-process (see
        SimulationSupervisor.start_evaluation). One run at a time: a 409
        names what is in the way. Distinct from /start-evaluator below,
        which launches a separate process for terminal / app.py use.
        """
        if supervisor is None:
            raise HTTPException(
                status_code=409,
                detail="This dashboard cannot start an evaluation: it is running "
                       "inside a simulation. Use server.py for a console that can.",
            )
        if not is_known_scenario(body.scenario_name) or body.scenario_name == "default":
            raise HTTPException(
                status_code=400,
                detail="Unknown scenario {!r}.".format(body.scenario_name),
            )
        if body.baseline not in ("vac", "fixed_timer"):
            raise HTTPException(
                status_code=400,
                detail="Unknown baseline {!r}; expected 'vac' or 'fixed_timer'.".format(body.baseline),
            )
        try:
            return supervisor.start_evaluation(body.scenario_name, baseline=body.baseline)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @router.post("/api/control/open-gui")
    async def open_gui():
        """
        Continue the running simulation in a SUMO window. Not a restart:
        the run saves its state and resumes from it, so the same vehicles
        and the same signal carry across. See SimulationSupervisor.open_gui.
        """
        if supervisor is None:
            raise HTTPException(
                status_code=409,
                detail="This dashboard does not own a simulation it could reopen.",
            )
        try:
            return supervisor.open_gui()
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @router.post("/api/control/stop-simulation")
    async def stop_simulation():
        """
        Same graceful stop as /api/control/stop, but reported through the
        supervisor so the response says whether there was anything to stop.
        """
        if supervisor is None:
            raise HTTPException(
                status_code=409,
                detail="This dashboard has no simulation of its own to stop.",
            )
        return supervisor.stop()

    @router.post("/api/control/start-evaluator")
    async def start_evaluator(body: StartEvaluatorRequest):
        if tracked.is_running():
            raise HTTPException(
                status_code=409,
                detail="An evaluator run is already active - stop it first.",
            )
        if body.scenario_name not in known_scenario_names():
            raise HTTPException(
                status_code=400,
                detail="Unknown scenario_name {!r} (no matching .sumocfg under "
                       "sumo/config/scenarios/).".format(body.scenario_name),
            )
        if body.baseline not in BASELINE_CONTROLLERS:
            raise HTTPException(
                status_code=400,
                detail="baseline must be one of {}, got {!r}.".format(
                    BASELINE_CONTROLLERS, body.baseline
                ),
            )

        args = [
            sys.executable, "-m", "performance.evaluator",
            "--scenario", body.scenario_name,
            "--baseline", body.baseline,
        ]
        if body.gui:
            args.append("--gui")

        env = dict(os.environ)
        env["PUSH_TO_CONTROL_URL"] = "http://{}:{}".format(
            Config.DASHBOARD_HOST, Config.DASHBOARD_PORT
        )

        popen_kwargs = {"cwd": _BACKEND_DIR, "env": env}
        if os.name == "nt":
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        try:
            process = subprocess.Popen(args, **popen_kwargs)
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail="Failed to launch evaluator subprocess: {}".format(exc),
            ) from exc

        tracked.process = process
        tracked.scenario_name = body.scenario_name
        tracked.baseline = body.baseline
        tracked.gui = body.gui
        tracked.started_at = datetime.now(timezone.utc).isoformat()
        logger.info(
            "Launched performance.evaluator (pid=%d) scenario=%s baseline=%s gui=%s",
            process.pid, body.scenario_name, body.baseline, body.gui,
        )
        return tracked.status_dict()

    @router.post("/api/control/stop-evaluator")
    async def stop_evaluator():
        if not tracked.is_running():
            tracked.clear()
            return {"stopped": False, "detail": "No evaluator run is currently active."}

        process = tracked.process
        try:
            if os.name == "nt":
                process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                process.terminate()
        except OSError as exc:
            logger.warning("Failed to signal evaluator process (%s); forcing kill.", exc)
            process.kill()
        else:
            deadline = time.monotonic() + _GRACEFUL_STOP_TIMEOUT_SECONDS
            while process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.2)
            if process.poll() is None:
                logger.warning(
                    "Evaluator process (pid=%d) did not exit within %.0fs of "
                    "the graceful stop signal - forcing kill.",
                    process.pid, _GRACEFUL_STOP_TIMEOUT_SECONDS,
                )
                process.kill()

        logger.info("Stopped evaluator process (pid=%d).", process.pid)
        tracked.clear()
        return {"stopped": True}

    @router.get("/api/control/status")
    async def control_status():
        return tracked.status_dict()

    @router.post("/api/internal/publish")
    async def internal_publish(snapshot: dict):
        # Intentionally not documented/exposed to the frontend as a
        # "public" endpoint - this is how a push-mode child (see
        # RemoteLiveStatePublisher) reports its own live state. No
        # payload-shape validation here: it is trusted, the same trust
        # boundary app.py's own direct LIVE_STATE.publish(...) call
        # already has - both are the simulation side publishing to
        # itself, not user input.
        store.publish(snapshot)
        return {"ok": True}

    return router
