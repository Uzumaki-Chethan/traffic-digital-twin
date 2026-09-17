"""
dashboard_server.py
===================
Read-only real-time dashboard backend: a FastAPI app that serves the
dashboard frontend (frontend's built static files) and pushes the
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

RUNNING: never launched directly as a script - this module has no main()
and takes no view on process lifetime. Two callers build it:

  app.py / PerformanceEvaluator  start_dashboard_server(), which runs
    uvicorn in a daemon thread inside the simulation process. One
    process, one store, zero IPC complexity; the server dies with the
    run, which is why every page went 502 when SUMO closed.
  server.py                      create_app() directly, served in the
    foreground by a process that OUTLIVES any simulation and can start
    one on request (services/sim_supervisor.py).

Both get the identical read-only app. The control endpoints are not
here in either case; they are injected as `extra_router` and live in
services/control_routes.py, so the rule above stays a property of this
file rather than a promise about it.
"""

import asyncio
import csv
import glob
import json
import logging
import os
import sqlite3
import threading
from typing import Optional

import uvicorn
from fastapi import APIRouter, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from analytics import average_wait_times, congestion_trend, detect_peak_periods
from analytics.congestion_analytics import latest_run_id
from config import Config
from services.live_state import LiveStateStore

logger = logging.getLogger(__name__)

# The React dashboard's production build (frontend/dist, built with
# `npm run build`). During frontend development, run `npm run dev`
# instead (it proxies /api and /ws to this server - see
# frontend/vite.config.ts) rather than relying on this static serve.
_FRONTEND_DIST = os.path.join(Config.PROJECT_ROOT, "frontend", "dist")
_FRONTEND_INDEX = os.path.join(_FRONTEND_DIST, "index.html")

# WebSocket push: a frame goes out as soon as the store holds a NEW one
# (checked every _BROADCAST_POLL_SECONDS - 10 ms, so a frame is at most
# that late, which also caps the rate at ~100 frames/s), and unchanged
# state is re-sent every
# _BROADCAST_HEARTBEAT_SECONDS so a client can tell "paused" from "gone".
# It used to be a flat 0.5 s: at 1x that is one frame per simulated
# second either way, but at "max" (8-16x) a frame then spanned 4-8
# simulated seconds, and no interpolation between two positions that far
# apart stays on the road - the page had to choose between smooth and
# correct. Per-tick frames make every frame ~1 simulated second at any
# speed.
_BROADCAST_POLL_SECONDS = 0.01
_BROADCAST_HEARTBEAT_SECONDS = 0.5

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


def create_app(store: LiveStateStore, extra_router: Optional[APIRouter] = None) -> FastAPI:
    """
    Build the dashboard FastAPI application bound to one live-state
    store.

    extra_router is an escape hatch for exactly one caller: app.py
    mounts services.control_routes.build_control_router() through it so
    ITS dashboard gains the ability to launch/stop a performance
    evaluation. Passing None (every other caller, including
    performance/evaluator.py's own --dashboard) leaves this file's own
    "pure viewer, no POST, no control socket" rule completely intact -
    this function still defines zero control endpoints of its own.
    """
    app = FastAPI(title="Traffic Digital Twin Dashboard")
    if extra_router is not None:
        app.include_router(extra_router)

    @app.get("/api/latest")
    async def latest():
        # Plain HTTP fallback for environments where WebSockets are
        # blocked; same read-only snapshot.
        return store.latest() or {"status": "waiting_for_simulation"}

    # Every log row belongs to a run (db_logger.run_id, 2026-09-17), and
    # these endpoints answer for ONE run - the newest unless ?run= names
    # another - so a list ordered by simulated time is one run's story,
    # never several runs shuffled together. ?run=all is the old
    # behaviour, kept for a legacy file with no run ids.
    def _run_clause(conn, run):
        if run == "all":
            return "", ()
        if run is None or run == "latest":
            run = latest_run_id(conn)
            if run is None:
                return "", ()
        return " WHERE run_id = ?", (run,)

    @app.get("/api/logs/runs")
    async def log_runs():
        """The runs the database holds, newest first, from decision_log."""
        try:
            conn = _read_only_connection()
        except sqlite3.OperationalError:
            return JSONResponse([])
        try:
            cur = conn.execute(
                "SELECT run_id, COUNT(*), MIN(time), MAX(time), MAX(scenario), "
                "SUM(CASE WHEN duration = 0 THEN 1 ELSE 0 END) FROM decision_log "
                "WHERE run_id IS NOT NULL GROUP BY run_id ORDER BY run_id DESC"
            )
            return [
                {
                    "run_id": r[0], "decisions": r[1], "first_time": r[2], "last_time": r[3],
                    "scenario": r[4], "switches": r[5],
                }
                for r in cur.fetchall()
            ]
        except sqlite3.OperationalError:
            return JSONResponse([])
        finally:
            conn.close()

    @app.get("/api/logs/decisions")
    async def decision_logs(limit: int = 200, run: str = None, after_id: int = None):
        """
        One run's decisions, newest first (`limit` ≤ 1000). With
        `after_id`, only rows newer than that id, OLDEST first — how the
        Decisions page follows a live run without refetching the lot.
        """
        import json

        limit = max(1, min(limit, _LOG_LIMIT_MAX))
        try:
            conn = _read_only_connection()
        except sqlite3.OperationalError:
            return JSONResponse([])
        try:
            where, params = _run_clause(conn, run)
            if after_id is not None:
                where = (where + " AND " if where else " WHERE ") + "id > ?"
                params = params + (after_id,)
                order = " ORDER BY id ASC LIMIT ?"
            else:
                order = " ORDER BY id DESC LIMIT ?"
            cur = conn.execute(
                "SELECT id, time, phase, duration, mode, reason, actual_phase, actual_is_yellow, "
                "run_id, phase_scores, margin, scenario "
                "FROM decision_log" + where + order,
                params + (limit,),
            )
            rows = []
            for r in cur.fetchall():
                try:
                    scores = json.loads(r[9]) if r[9] else None
                except (TypeError, ValueError):
                    scores = None
                rows.append({
                    "id": r[0], "time": r[1], "phase": r[2],
                    "duration": r[3], "mode": r[4], "reason": r[5],
                    "actual_phase": r[6],
                    "actual_is_yellow": None if r[7] is None else bool(r[7]),
                    "run_id": r[8],
                    "phase_scores": scores,
                    "margin": r[10],
                    "scenario": r[11],
                })
        finally:
            conn.close()
        return rows

    @app.get("/api/logs/performance")
    async def performance_logs(limit: int = 200, run: str = None):
        limit = max(1, min(limit, _LOG_LIMIT_MAX))
        try:
            conn = _read_only_connection()
        except sqlite3.OperationalError:
            return JSONResponse([])
        try:
            where, params = _run_clause(conn, run)
            cur = conn.execute(
                "SELECT id, time, avg_wait, avg_speed, queue_length, stopped "
                "FROM performance_log" + where + " ORDER BY time DESC LIMIT ?",
                params + (limit,),
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
    async def prediction_logs(limit: int = 200, run: str = None):
        import json

        limit = max(1, min(limit, _LOG_LIMIT_MAX))
        try:
            conn = _read_only_connection()
        except sqlite3.OperationalError:
            return JSONResponse([])
        try:
            where, params = _run_clause(conn, run)
            cur = conn.execute(
                "SELECT id, time, predicted_values, actual_values, confidence "
                "FROM prediction_log" + where + " ORDER BY time DESC LIMIT ?",
                params + (limit,),
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

    @app.get("/api/analytics/wait-times")
    async def analytics_wait_times(
        group_by: str = "network", start_time: float = None, end_time: float = None
    ):
        # Thin wrapper: all the actual query/aggregation logic lives in
        # analytics/congestion_analytics.py, which takes a plain db_path
        # and has no FastAPI dependency of its own (independently
        # testable, importable from a script or test with no server
        # running).
        if group_by not in ("network", "lane"):
            return JSONResponse(
                {"error": "group_by must be 'network' or 'lane'"}, status_code=400
            )
        return average_wait_times(
            Config.DB_PATH, group_by=group_by, start_time=start_time, end_time=end_time
        )

    @app.get("/api/analytics/congestion-trend")
    async def analytics_congestion_trend(bucket_seconds: float = 60.0, group_by: str = "network"):
        if group_by not in ("network", "lane"):
            return JSONResponse(
                {"error": "group_by must be 'network' or 'lane'"}, status_code=400
            )
        if bucket_seconds <= 0:
            return JSONResponse({"error": "bucket_seconds must be positive"}, status_code=400)
        return congestion_trend(Config.DB_PATH, bucket_seconds=bucket_seconds, group_by=group_by)

    @app.get("/api/analytics/peak-periods")
    async def analytics_peak_periods(top_n: int = 3, window_seconds: float = 60.0):
        if top_n <= 0 or window_seconds <= 0:
            return JSONResponse(
                {"error": "top_n and window_seconds must both be positive"}, status_code=400
            )
        return detect_peak_periods(Config.DB_PATH, top_n=top_n, window_seconds=window_seconds)

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
            loop = asyncio.get_running_loop()
            sent_version = None
            sent_at = float("-inf")
            while True:
                if hasattr(store, "latest_versioned"):
                    snapshot, version = store.latest_versioned()
                else:  # a bare store in tests
                    snapshot, version = store.latest(), None
                now = loop.time()
                fresh = version is None or version != sent_version
                if fresh or now - sent_at >= _BROADCAST_HEARTBEAT_SECONDS:
                    if snapshot is None:
                        await websocket.send_json(
                            {"status": "waiting_for_simulation"}
                        )
                    else:
                        await websocket.send_json(snapshot)
                    sent_version = version
                    sent_at = now
                await asyncio.sleep(_BROADCAST_POLL_SECONDS)
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

    def _index_response() -> HTMLResponse:
        if os.path.isfile(_FRONTEND_INDEX):
            with open(_FRONTEND_INDEX, "r", encoding="utf-8") as fh:
                return HTMLResponse(fh.read())
        return HTMLResponse(
            "<p>No frontend build found. Run <code>npm run build</code> "
            "in frontend/, or <code>npm run dev</code> for development "
            "(it proxies to this server).</p>"
        )

    @app.get("/", response_class=HTMLResponse)
    async def index():
        return _index_response()

    # SPA fallback: the React router owns /analytics, /performance,
    # /settings, ... so a deep link or a reload on one of them must get
    # index.html, not a 404. Registered last, so every real route above
    # (/api/*, /ws, /assets) still wins; anything under /api that does
    # not exist stays a 404 rather than turning into a page.
    @app.get("/{path:path}", response_class=HTMLResponse, include_in_schema=False)
    async def spa_fallback(path: str):
        if path.startswith("api/") or path == "ws" or path.startswith("assets/"):
            raise HTTPException(status_code=404, detail="Not Found")
        return _index_response()

    return app


def start_dashboard_server(
    store: LiveStateStore,
    host: str = Config.DASHBOARD_HOST,
    port: int = Config.DASHBOARD_PORT,
    extra_router: Optional[APIRouter] = None,
) -> threading.Thread:
    """
    Start the dashboard server in a daemon thread and return the thread
    (already started). The daemon flag means the server dies with the
    simulation process - no shutdown plumbing needed in app.py's finally
    block.
    """
    app = create_app(store, extra_router=extra_router)
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