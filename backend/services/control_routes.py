"""
control_routes.py
==================
The ONLY module in this project that lets a web request affect what
process is running - deliberately kept separate from
services/dashboard_server.py so that file's own "pure viewer, no POST,
no control socket" claim about itself stays literally true.
`build_control_router()` is called once, by app.py only, when it starts
its dashboard server; performance/evaluator.py's own standalone
--dashboard run never mounts this, so a spawned evaluator's dashboard
(if it even starts one - see below) can never itself spawn further
evaluators.

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

import glob
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
from services.live_state import LiveStateStore

logger = logging.getLogger(__name__)

_BACKEND_DIR = os.path.join(Config.PROJECT_ROOT, "backend")
_SCENARIO_DIR = os.path.join(Config.PROJECT_ROOT, "sumo", "config", "scenarios")

# How long to wait for a graceful CTRL_BREAK_EVENT shutdown before
# escalating to a hard kill. SUMO + TraCI teardown is normally
# sub-second; this is a generous margin, not a tight budget.
_GRACEFUL_STOP_TIMEOUT_SECONDS = 10.0


class StartEvaluatorRequest(BaseModel):
    scenario_name: str
    baseline: str = "fixed_timer"
    gui: bool = False


def _known_scenario_names() -> set:
    return {
        os.path.splitext(os.path.basename(path))[0]
        for path in glob.glob(os.path.join(_SCENARIO_DIR, "*.sumocfg"))
    }


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


def build_control_router(store: LiveStateStore) -> APIRouter:
    """
    Build the control API, bound to `store` - the SAME LiveStateStore
    the calling process's own simulation loop publishes into (app.py
    passes its LIVE_STATE). Called once, from app.py only.
    """
    router = APIRouter()
    tracked = _TrackedRun()

    @router.post("/api/control/start-evaluator")
    async def start_evaluator(body: StartEvaluatorRequest):
        if tracked.is_running():
            raise HTTPException(
                status_code=409,
                detail="An evaluator run is already active - stop it first.",
            )
        if body.scenario_name not in _known_scenario_names():
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
