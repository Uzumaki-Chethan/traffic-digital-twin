"""
app.py
======
Entry point for a live AI-controlled simulation started from a terminal:

    python app.py

It starts the read-only dashboard server in a daemon thread and then
runs one simulation in the foreground, exiting when that simulation
ends. The simulation itself lives in simulation_runner.run_simulation()
- extracted 2026-09-12 so that server.py (the always-on console, which
can start a run from a button in the browser) runs the identical code
rather than a lookalike copy. See that module for the pipeline wiring
and the three read-only side-channels.

WHICH ENTRY POINT TO USE:
  python app.py     one run, dashboard alive only as long as that run
  python server.py  console stays up; start/pause/stop runs from the UI

app.py is kept because it is the shortest path to a live simulation and
what every existing doc, test and habit refers to; nothing about it has
changed behaviourally.
"""

import logging

from config import Config
from services.live_state import DEFAULT_STORE as LIVE_STATE
from services.dashboard_server import start_dashboard_server
from services.control_routes import build_control_router
from services.run_control import RunControl
from simulation_runner import run_simulation

# Shared pause/stop/speed state for this process's run loop. Created here
# (not inside main()) so the control router and the loop are handed the
# very same object; see services/run_control.py for why it lives outside
# both.
RUN_CONTROL = RunControl()


def main():
    logging.basicConfig(
        level=Config.LOG_LEVEL,
        format=Config.LOG_FORMAT,
        datefmt=Config.LOG_DATE_FORMAT,
    )
    logger = logging.getLogger(__name__)

    Config.validate()

    # Read-only dashboard server: daemon thread inside this process,
    # fed exclusively through LIVE_STATE.publish(). Set
    # Config.DASHBOARD_ENABLED = False to run without it.
    if Config.DASHBOARD_ENABLED:
        try:
            # extra_router: this is the one dashboard instance allowed
            # to launch/stop a performance evaluation from a button -
            # see services/control_routes.py's module docstring for why
            # this lives outside dashboard_server.py itself. No
            # supervisor is passed: this process IS the run, so there is
            # nothing here that could start a second one.
            start_dashboard_server(
                LIVE_STATE, Config.DASHBOARD_HOST, Config.DASHBOARD_PORT,
                extra_router=build_control_router(LIVE_STATE, RUN_CONTROL),
            )
        except Exception:
            logger.exception("Dashboard failed to start (simulation continues)")

    try:
        run_simulation(LIVE_STATE, RUN_CONTROL)
    except Exception:
        logger.exception("Simulation stopped due to an unexpected error.")
        raise


if __name__ == "__main__":
    main()
