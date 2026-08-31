"""
dashboard_server.py
===================
Read-only real-time dashboard backend: a FastAPI app that serves the
single-page dashboard (frontend/dashboard.html) and pushes the latest
LiveStateStore snapshot to every connected WebSocket client once per
second.

ARCHITECTURE RULE: this server is a pure VIEWER. It exposes no
endpoints that could influence the simulation - there is no POST, no
control socket, nothing. The only data source is LiveStateStore.latest(),
written exclusively by the simulation side.

RUNNING: never launched directly as a script. app.py (and optionally
PerformanceEvaluator) call start_dashboard_server(), which runs uvicorn
in a daemon thread inside the simulation process. One process, one
store, zero IPC complexity.
"""

import asyncio
import logging
import os
import threading

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

from config import Config
from services.live_state import LiveStateStore

logger = logging.getLogger(__name__)

_FRONTEND_PATH = os.path.join(Config.PROJECT_ROOT, "frontend", "dashboard.html")

# Push cadence for WebSocket clients. The store updates at 1 Hz; polling
# slightly faster than that is harmless and keeps the countdown smooth.
_BROADCAST_INTERVAL_SECONDS = 0.5


def create_app(store: LiveStateStore) -> FastAPI:
    """
    Build the dashboard FastAPI application bound to one live-state
    store.
    """
    app = FastAPI(title="Traffic Digital Twin Dashboard")

    @app.get("/", response_class=HTMLResponse)
    async def index():
        with open(_FRONTEND_PATH, "r", encoding="utf-8") as fh:
            return HTMLResponse(fh.read())

    @app.get("/api/latest")
    async def latest():
        # Plain HTTP fallback for environments where WebSockets are
        # blocked; same read-only snapshot.
        return store.latest() or {"status": "waiting_for_simulation"}

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await websocket.accept()
        logger.info("Dashboard client connected")
        try:
            while True:
                snapshot = store.latest()
                if snapshot is None:
                    await websocket.send_json(
                        {"status": "waiting_for_simulation"}
                    )
                else:
                    await websocket.send_json(snapshot)
                await asyncio.sleep(_BROADCAST_INTERVAL_SECONDS)
        except WebSocketDisconnect:
            logger.info("Dashboard client disconnected")
        except Exception:
            logger.exception("Dashboard WebSocket error")

    return app


def start_dashboard_server(
    store: LiveStateStore,
    host: str = Config.DASHBOARD_HOST,
    port: int = Config.DASHBOARD_PORT,
) -> threading.Thread:
    """
    Start the dashboard server in a daemon thread and return the thread
    (already started). The daemon flag means the server dies with the
    simulation process - no shutdown plumbing needed in app.py's finally
    block.
    """
    app = create_app(store)
    config = uvicorn.Config(
        app, host=host, port=port, log_level="warning", lifespan="off"
    )
    server = uvicorn.Server(config)

    def _run():
        try:
            server.run()
        except Exception:
            logger.exception("Dashboard server crashed (simulation unaffected)")

    thread = threading.Thread(target=_run, name="dashboard-server", daemon=True)
    thread.start()
    logger.info("Dashboard server starting on http://%s:%d", host, port)
    return thread