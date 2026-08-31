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

"""
dashboard_server.py
===================
Read-only real-time dashboard backend: a FastAPI app that serves the
dashboard frontend (frontend-v2's built static files) and pushes the
latest LiveStateStore snapshot to every connected WebSocket client once
per second. It also exposes a handful of read-only history endpoints so
the frontend's Logs & Insights and Performance pages can show data that
predates the current process (past decisions, past evaluation runs).

ARCHITECTURE RULE: this server is a pure VIEWER. It exposes no
endpoints that could influence the simulation - there is no POST, no
control socket, nothing. Every route below only ever reads: from
LiveStateStore.latest() (written exclusively by the simulation side),
from the SQLite log tables db_logger.py already writes, or from CSV
files performance/evaluator.py already writes to results/. Nothing here
opens a write connection to the database or spawns a process.

RUNNING: never launched directly as a script. app.py (and optionally
PerformanceEvaluator) call start_dashboard_server(), which runs uvicorn
in a daemon thread inside the simulation process. One process, one
store, zero IPC complexity.
"""

import asyncio
import csv
import glob
import json
import logging
import os
import sqlite3
import threading

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from config import Config
from services.live_state import LiveStateStore

logger = logging.getLogger(__name__)

# The new React dashboard's production build (frontend-v2/dist, built with
# `npm run build`). During frontend development, run `npm run dev`
# instead (it proxies /api and /ws to this server - see
# frontend-v2/vite.config.ts) rather than relying on this static serve.
_FRONTEND_DIST = os.path.join(Config.PROJECT_ROOT, "frontend-v2", "dist")
_FRONTEND_INDEX = os.path.join(_FRONTEND_DIST, "index.html")

# Legacy single-file dashboard, kept only as a fallback so this module
# still serves *something* human-readable if the React build hasn't
# been produced yet in a given checkout.
_LEGACY_FRONTEND_PATH = os.path.join(Config.PROJECT_ROOT, "frontend", "dashboard.html")

# Push cadence for WebSocket clients. The store updates at 1 Hz; polling
# slightly faster than that is harmless and keeps the countdown smooth.
_BROADCAST_INTERVAL_SECONDS = 0.5

_RESULTS_DIR = os.path.join(Config.PROJECT_ROOT, "results")

# Static training-time metadata written once by ml/training/train.py -
# not runtime data, but genuinely useful context for a viewer (test MAE,
# training row counts, which scenarios contributed). Read fresh on every
# request rather than cached, so a re-trained model's new metadata shows
# up without restarting the server.
_MODEL_METADATA_PATH = os.path.join(
    Config.PROJECT_ROOT, "backend", "ml", "trained_models",
    "random_forest_predictor.metadata.json",
)

_LOG_LIMIT_MAX = 1000


def _read_only_connection() -> sqlite3.Connection:
    """
    Opens Config.DB_PATH in SQLite's own read-only URI mode (mode=ro) -
    a second, genuinely read-only handle alongside db_logger's writer
    connection, so a dashboard client can never write through this path
    even by mistake. Raises if the DB file does not exist yet (e.g. the
    simulation has not run once), which the caller below turns into an
    empty list rather than a 500.
    """
    uri = "file:{}?mode=ro".format(Config.DB_PATH)
    return sqlite3.connect(uri, uri=True)


def create_app(store: LiveStateStore) -> FastAPI:
    """
    Build the dashboard FastAPI application bound to one live-state
    store.
    """
    app = FastAPI(title="Traffic Digital Twin Dashboard")

    @app.get("/api/latest")
    async def latest():
        # Plain HTTP fallback for environments where WebSockets are
        # blocked; same read-only snapshot.
        return store.latest() or {"status": "waiting_for_simulation"}

    @app.get("/api/logs/decisions")
    async def decision_logs(limit: int = 200):
        limit = max(1, min(limit, _LOG_LIMIT_MAX))
        try:
            conn = _read_only_connection()
        except sqlite3.OperationalError:
            return JSONResponse([])
        try:
            cur = conn.execute(
                "SELECT id, time, phase, duration, mode, reason "
                "FROM decision_log ORDER BY time DESC LIMIT ?",
                (limit,),
            )
            rows = [
                {
                    "id": r[0], "time": r[1], "phase": r[2],
                    "duration": r[3], "mode": r[4], "reason": r[5],
                }
                for r in cur.fetchall()
            ]
        finally:
            conn.close()
        return rows

    @app.get("/api/logs/performance")
    async def performance_logs(limit: int = 200):
        limit = max(1, min(limit, _LOG_LIMIT_MAX))
        try:
            conn = _read_only_connection()
        except sqlite3.OperationalError:
            return JSONResponse([])
        try:
            cur = conn.execute(
                "SELECT id, time, avg_wait, avg_speed, queue_length, stopped "
                "FROM performance_log ORDER BY time DESC LIMIT ?",
                (limit,),
            )
            rows = [
                {
                    "id": r[0], "time": r[1], "avg_wait": r[2],
                    "avg_speed": r[3], "queue_length": r[4], "stopped": r[5],
                }
                for r in cur.fetchall()
            ]
        finally:
            conn.close()
        return rows

    @app.get("/api/logs/predictions")
    async def prediction_logs(limit: int = 200):
        import json

        limit = max(1, min(limit, _LOG_LIMIT_MAX))
        try:
            conn = _read_only_connection()
        except sqlite3.OperationalError:
            return JSONResponse([])
        try:
            cur = conn.execute(
                "SELECT id, time, predicted_values, actual_values, confidence "
                "FROM prediction_log ORDER BY time DESC LIMIT ?",
                (limit,),
            )
            rows = []
            for r in cur.fetchall():
                try:
                    predicted = json.loads(r[2])
                    actual = json.loads(r[3])
                except (TypeError, ValueError):
                    predicted, actual = {}, {}
                rows.append({
                    "id": r[0], "time": r[1],
                    "predicted_values": predicted,
                    "actual_values": actual,
                    "confidence": r[4],
                })
        finally:
            conn.close()
        return rows

    @app.get("/api/results")
    async def saved_results():
        # Parses every results/comparison_<scenario>.csv written by
        # PerformanceEvaluator.save_csv() - see performance/evaluator.py.
        # Returns [] if no evaluator run has been saved yet.
        summaries = []
        for csv_path in sorted(glob.glob(os.path.join(_RESULTS_DIR, "comparison_*.csv"))):
            scenario = os.path.basename(csv_path)[len("comparison_"):-len(".csv")]
            rows = []
            with open(csv_path, "r", newline="") as fh:
                for row in csv.DictReader(fh):
                    try:
                        rows.append({
                            "metric": row["metric"],
                            "ai": float(row["ai"]),
                            "baseline": float(row["baseline"]),
                            "improvement_pct": float(row["improvement_pct"]),
                        })
                    except (KeyError, ValueError):
                        continue
            summaries.append({"scenario": scenario, "rows": rows})
        return summaries

    @app.get("/api/model-info")
    async def model_info():
        # Verbatim pass-through of the metadata file
        # ml/training/train.py writes alongside the trained model - test
        # MAE, held-out MAE, training row counts, which scenarios/seeds
        # contributed. Returns {} if no model has been trained yet.
        if not os.path.isfile(_MODEL_METADATA_PATH):
            return JSONResponse({})
        try:
            with open(_MODEL_METADATA_PATH, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, json.JSONDecodeError):
            return JSONResponse({})

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

    # Serve the React build's static assets (JS/CSS/etc) if it has been
    # built. Mounted after the API routes above so /api/* and /ws always
    # take precedence over the SPA catch-all.
    if os.path.isdir(_FRONTEND_DIST):
        app.mount(
            "/assets",
            StaticFiles(directory=os.path.join(_FRONTEND_DIST, "assets")),
            name="assets",
        )

    @app.get("/", response_class=HTMLResponse)
    async def index():
        if os.path.isfile(_FRONTEND_INDEX):
            with open(_FRONTEND_INDEX, "r", encoding="utf-8") as fh:
                return HTMLResponse(fh.read())
        if os.path.isfile(_LEGACY_FRONTEND_PATH):
            with open(_LEGACY_FRONTEND_PATH, "r", encoding="utf-8") as fh:
                return HTMLResponse(fh.read())
        return HTMLResponse(
            "<p>No frontend build found. Run <code>npm run build</code> "
            "in frontend-v2/, or <code>npm run dev</code> for development "
            "(it proxies to this server).</p>"
        )

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