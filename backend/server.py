"""
server.py
=========
The Trinetra console: an always-on server you start once and then drive
entirely from the browser.

    python server.py                 then open http://127.0.0.1:8000

WHY THIS EXISTS. `python app.py` starts the dashboard INSIDE the
simulation process, which has two consequences the dashboard could not
talk its way out of: nothing can be started from the UI (the UI only
exists once a run is already up), and when the run ends the server ends
with it - so every page went 502 the moment SUMO closed, including the
pages that read nothing but the recorded database. This process inverts
that relationship: the console owns the lifetime, a simulation is
something it starts and stops.

WHAT IT SERVES. Exactly the same read-only dashboard app.py serves -
`create_app()` from services/dashboard_server.py, unchanged, still with
zero control endpoints of its own - plus the control router from
services/control_routes.py, which is where every endpoint that can
affect a running simulation has always lived. The one new capability is
`POST /api/control/start-simulation`, backed by
services/sim_supervisor.py.

app.py is deliberately left in place and unchanged in behaviour: it is
the shortest path to a live simulation, and what the docs, the tests and
the habit refer to.
"""

import argparse
import logging

import uvicorn

from config import Config
from services.live_state import DEFAULT_STORE as LIVE_STATE
from services.dashboard_server import create_app
from services.control_routes import build_control_router
from services.sim_supervisor import SimulationSupervisor


def build_server_app(store=LIVE_STATE):
    """
    The console FastAPI app: the read-only dashboard plus the control
    router, wired to a supervisor that can start a live run.

    Separate from main() so a test can exercise the endpoints with
    TestClient without binding a port.
    """
    supervisor = SimulationSupervisor(store)
    app = create_app(
        store,
        extra_router=build_control_router(store, supervisor.run_control, supervisor),
    )
    # Attached so a caller (a test, or a future admin route) can reach the
    # supervisor without rebuilding the app; nothing in the request path
    # reads it, so this cannot become a back door into the viewer.
    app.state.supervisor = supervisor
    return app


def main():
    parser = argparse.ArgumentParser(
        description="Trinetra console: serves the dashboard and starts/stops "
                    "live simulations on request.",
    )
    parser.add_argument("--host", default=Config.DASHBOARD_HOST)
    parser.add_argument("--port", type=int, default=Config.DASHBOARD_PORT)
    args = parser.parse_args()

    logging.basicConfig(
        level=Config.LOG_LEVEL,
        format=Config.LOG_FORMAT,
        datefmt=Config.LOG_DATE_FORMAT,
    )
    logger = logging.getLogger(__name__)

    # Fail here, at startup, rather than when someone presses Start and
    # gets a 500 back for a missing sumocfg.
    Config.validate()

    app = build_server_app()
    logger.info("Trinetra console on http://%s:%d - press Start in the UI to "
                "launch a simulation.", args.host, args.port)
    # Foreground, unlike start_dashboard_server()'s daemon thread: here the
    # server IS the process, and a simulation is the background work.
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
