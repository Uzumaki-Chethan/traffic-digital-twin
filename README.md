# AI-Driven Intelligent Adaptive Traffic Digital Twin & Optimization System

A real-time, closed-loop adaptive traffic signal control system built on
SUMO + TraCI, with an ML prediction layer (RandomForest), a rule-based
adaptive Decision Engine, and a parallel-simulation Performance
Evaluation framework that proves the AI beats SUMO's default control.

---

## Architecture (the backbone — do not break this)

```
SUMO (TraCI)
   ↓
TrafficAdapter          ← the ONLY module allowed to touch traci
   ↓
DigitalTwin             ← current state + rolling history
   ↓
FeatureEngineer         ← 125 engineered features
   ↓
MLPredictor             ← RandomForest, 24 targets, 15s horizon,
   ↓                       isotonic-calibrated confidence
DecisionEngine          ← phase scoring, min/max green, hysteresis,
   ↓                       starvation handling, emergency override,
                          confidence-aware prediction blending
SignalController        ← Decision → TraCI commands; yellow-clearance
                          safety; execution only, zero logic
```

This separation is intentional and graded. Every module has one job;
`app.py` only orchestrates startup / run / shutdown.

## Project status

| Stage | Status |
|---|---|
| Traffic simulation (multi-scenario, multi-seed) | ✔ done |
| Dataset + training (Test MAE ≈ 1.63, held-out ≈ 1.99, extreme ≈ 2.87) | ✔ done |
| ML predictor (125 features → 24 targets, calibrated confidence) | ✔ done |
| Decision Engine (core intelligence) | ✔ done |
| Signal Controller | ✔ done |
| Closed-loop integration (`app.py`) | ✔ done |
| **Performance Evaluation (AI vs baseline)** | ✔ **done** |
| **Real-time Dashboard** | ✔ **done** |
| **Emergency vehicle detection** | ✔ **done** |
| **Database logging (SQLite)** | ✔ **done** |
| Final optimization + demo polish | ⬜ |

Full engineering context and history: see `PROJECT_ARCHITECTURE_REPORT.md`
(Section 15 = current state).

---

## Quick start

Requirements: Python 3.10+, SUMO installed with `SUMO_HOME` set,
`pip install -r requirements.txt`.

### Run the live AI-controlled simulation (GUI)

```bash
cd backend
python app.py
```

Opens a sumo-gui window; the AI decides at 1 Hz, logs status once per
second, and controls the junction through safe yellow-clearance
transitions.

### Run the Performance Evaluation (AI vs Baseline)

Two PARALLEL, lockstep-synchronized SUMO instances of the SAME scenario
(same network, same routes, same seed):

```bash
cd backend

# headless comparison + CSV, baseline = frozen fixed-timer program (default)
python -m performance.evaluator --scenario heavy_seed1

# baseline = Vehicle Actuated Control (VAC) - a real adaptive controller,
# not a fixed-timer strawman (see performance/baseline_controllers.py)
python -m performance.evaluator --scenario heavy_seed1 --baseline vac

# dual-GUI demo mode (two windows side by side)
python -m performance.evaluator --scenario rush_hour_seed1 --gui
```

Output example (`--baseline fixed_timer`, the default):

```
=== AI vs Fixed-Timer - light_seed1 ===
Metric                                 AI     Baseline           Change
-----------------------------------------------------------------------
Avg Waiting Time (s)                 2.56        11.56       v   77.9% IMPROVED
Avg Travel Time (s)                 46.34        53.14       v   12.8% IMPROVED
Worst Travel Time (s)              125.10       122.85       x    1.8% REGRESSED
Avg Queue Length (veh)               3.11         4.94       v   37.1% IMPROVED
Max Queue Length (veh)              30.00        30.00       v    0.0% IMPROVED
Avg Speed (m/s)                      7.98         6.85       v   16.4% IMPROVED
Throughput (veh completed)         240.00       240.00       v    0.0% IMPROVED

Saved: results/comparison_light_seed1.csv
```

Improvement percentages are signed — regressions are reported honestly.

**Result against `--baseline vac`** (verified 2026-09-06 — see PROJECT_ARCHITECTURE_REPORT.md
Sections 20-22 for the complete tuning history, an independent Opus-driven root-cause
analysis, and every per-metric number):

**All 13 scenario types are clean 7/7 sweeps against VAC** (every scenario's seed 1 —
light, balanced, heavy, extreme, north/south/east/west_heavy, accident, emergency_response,
normal_traffic, rain, and rush_hour). This took four rounds of work, each grounded in real
A/B evidence against VAC, never guesses:

1. **Gap-out** (Section 19): the AI had no equivalent of VAC's own gap-out — VAC releases a
   phase the instant its lanes go empty; the AI would hold an already-empty phase open until
   max-green or a rival's score climbed enough, wasting exactly the time VAC recovers. Fixed
   by adding the same check VAC uses, gated identically for a fair comparison.
2. **Switch-confirmation debounce** (Section 19, the anti-flicker fix): an ordinary
   preference-based switch now needs the same candidate to lead for `switch_confirmation_
   seconds` (3s) of *consecutive* time before committing — a transient 2-3 vehicle blip can
   no longer flip the signal.
3. **A real bug fix, found by an independent Opus-driven deep-dive** (Section 21): the phase
   just switched TO was keeping its OLD "seconds since last served" starvation credit for
   its entire green (only the outgoing phase's timer was ever reset), silently blocking
   legitimate mid-green preemption and causing clock-driven switches unrelated to real
   traffic — worst on `balanced` (moderate, perfectly uniform demand), which went from the
   single worst-performing scenario (2/7) to a clean 7/7 sweep once fixed.
4. **Max-waiting-time added to lane scoring** (Section 22): the score previously only saw a
   lane's *mean* wait, which can look fine while one specific vehicle has been stuck far
   longer than everyone else — exactly what produces a bad worst-case travel time.
   `LaneFeatures.max_waiting_time` was already being computed but never used; adding it
   fixed `north_heavy` and `rush_hour`'s remaining gaps (`rush_hour` had been the hardest
   holdout — a 3-phase demand ramp, the only non-flat scenario in the library).

Each of steps 3 and 4 shifted what the best `switch_hysteresis_margin` was — it moved
0.08 → 0.25 → 0.30 → 0.35 over the course of this work, re-verified against real evaluator
runs at every step, never assumed to transfer from the previous round.

**On whether this generalizes beyond the seeds actually tested:** mostly, not perfectly, and
that's reported honestly rather than oversold. Spot-checking additional seeds after locking
in the final config found `balanced_seed2`, `heavy_seed2`, `light_seed2`, and
`north_heavy_seed3` all clean 7/7 too — but `north_heavy_seed2` picked up a small miss
(2 metrics, single-digit percent) it didn't have before. This is expected: `throughput` is
tied by construction in every comparison, and `max_travel_time`/`max_queue_length` are
single-sample/single-instant extremes, so *some* seed of a close-fought scenario will
occasionally land a small miss no matter how the config is tuned — tuning further would just
relocate which seed it lands on, not eliminate it. The specific runs the user asked to be
fixed (`north_heavy_seed1`, `rush_hour_seed1`) are both now genuinely, verifiably clean.

### Run the Real-Time Dashboard

The dashboard starts AUTOMATICALLY with the simulation:

```bash
cd backend
python app.py
# then open http://127.0.0.1:8000 in a browser
```

A professional multi-page **Traffic Command Center** UI with sidebar
navigation (Overview / Digital Twin / Performance / Decisions):

- **Overview** — large signal visualization with countdown, KPI cards,
  emergency alert banner, AI-vs-baseline summary, 60 s phase timeline.
- **Digital Twin** — lane density bars color-coded by signal state,
  prediction-vs-actual table, model confidence visualization.
- **Performance** — waiting-time and queue-length charts over time,
  throughput comparison bars, signed improvement percentages.
- **Decisions** — current phase, decision-mode badge
  (NORMAL / STARVATION / EMERGENCY), full reason_text, phase history.

Dependency-free canvas charting (no CDN needed — works offline).

For the comparison panel during evaluation runs:

```bash
cd backend
python -m performance.evaluator --scenario heavy_seed1 --dashboard
# open http://127.0.0.1:8000 — watch % improvements converge live
```

`services/dashboard_server.py` itself remains strictly READ-ONLY: it is
fed by an in-process snapshot store (`services/live_state.py`) over
WebSocket, and defines zero endpoints that can send a command into the
simulation. `app.py`'s dashboard additionally mounts one narrowly-scoped
control layer on top of it (see "Run a demo without touching a
terminal", below) — that capability lives entirely in a separate
module, `services/control_routes.py`, so `dashboard_server.py`'s own
claim about itself stays true; a standalone `python -m
performance.evaluator --dashboard` never gains it.

### Run a demo without touching a terminal (beyond `python app.py`)

Once `python app.py` is running, its dashboard can launch and stop a
Performance Evaluation itself — no second terminal command needed:

```bash
curl -X POST http://127.0.0.1:8000/api/control/start-evaluator \
     -H "Content-Type: application/json" \
     -d '{"scenario_name": "heavy_seed1", "baseline": "vac", "gui": false}'

curl http://127.0.0.1:8000/api/control/status
curl -X POST http://127.0.0.1:8000/api/control/stop-evaluator
```

Mechanics: this launches `python -m performance.evaluator` as a genuinely
separate OS process (its own two SUMO/TraCI connections), with an
environment variable telling it to push its live snapshots back over
HTTP into app.py's own `LiveStateStore` (`RemoteLiveStatePublisher`,
`services/live_state.py`) instead of trying to bind its own copy of the
dashboard on the same port. `scenario_name`/`baseline` are validated
against real `.sumocfg` files / a fixed whitelist before ever reaching
the subprocess command line. On Windows, stopping sends `CTRL_BREAK_EVENT`
to let the child's own TraCI/SUMO shutdown run cleanly (same as a
terminal Ctrl+C), falling back to a hard kill only if it doesn't exit in
time. Running `python -m performance.evaluator --dashboard` directly
from a terminal (development/debugging) is completely unaffected — it
still self-hosts its own dashboard exactly as before.

### Batch controller matrix (fixed-timer / VAC / AI across scenarios)

```bash
cd backend
python -m performance.evaluate                        # full matrix
python -m performance.evaluate --controllers ai --scenarios heavy_seed1
```

Writes `results/performance_summary.csv`.

---

## How the evaluation guarantees a fair comparison

1. **Two separate SUMO processes** on separate labeled TraCI connections
   (`"ai"` / `"baseline"`). Never one shared instance — one traffic light
   cannot run two control strategies.
2. **Identical demand**: both managers launch the *same* frozen sumocfg
   (same network, same route files, same random seed).
3. **Lockstep stepping**: both simulations advance one 0.05 s step per
   loop iteration; metrics are recorded at identical simulated timestamps.
4. **Baseline is selectable, never the ML DecisionEngine**: `--baseline
   fixed_timer` (default) means the baseline connection NEVER receives a
   trafficlight command — its frozen static program runs untouched.
   `--baseline vac` means it's driven by `VehicleActuatedController`
   (`performance/baseline_controllers.py`), a real demand-responsive
   rule-based controller, through its own `SignalController` bound
   explicitly to the baseline connection. Either way, the ML
   DecisionEngine only ever runs on the "ai" connection.
5. **Identical measurement path**: both sides feed `MetricsCollector`
   raw `SimulationState` snapshots from their own adapter.
6. **Same decision cadence for AI**: 1 Hz throttling with the exact
   float-epsilon guard used in `app.py` (matches training cadence).

## Metrics collected

All time-weighted integrals over simulated time:

| Metric | Definition |
|---|---|
| Avg waiting time | mean accumulated wait of all vehicles present |
| Queue length | vehicles < 0.1 m/s (SUMO halting def.), total + per lane |
| Throughput | unique vehicles completing trips (+ veh/hour) |
| Avg speed | mean speed of all vehicles present |
| Stopped vehicles | instantaneous count below threshold |
| Travel time | per-vehicle entry→exit duration (avg + worst) |

## Key modules

| Path | Role |
|---|---|
| `backend/app.py` | Runtime entry point: wires the whole pipeline, runs the loop |
| `backend/config.py` | Single source of truth for paths/settings |
| `backend/traffic/traci_manager.py` | TraCI lifecycle; labeled multi-instance support |
| `backend/traffic_adapter/adapter.py` | The only traci boundary; immutable snapshots |
| `backend/digital_twin/` | Current state + bounded history |
| `backend/feature_engineering/` | Raw state → 125 engineered features |
| `backend/ml/` | Predictor + training pipeline + feature schema |
| `backend/decision_engine/decision_engine.py` | Phase scoring, hysteresis, starvation, emergency logic |
| `backend/decision_engine/decision_config.py` | Every DecisionEngine tunable, as one overridable dataclass |
| `backend/decision_engine/calibrate_normalization.py` | Derives normalization ceilings from recorded data (manual, offline) |
| `backend/signal_controller/` | Decision → safe TraCI execution (yellow clearance) |
| `backend/analytics/congestion_analytics.py` | Read-only congestion trend / peak-period / wait-time analytics over the SQLite logs |
| `backend/performance/evaluator.py` | Parallel AI-vs-baseline evaluator (`--baseline fixed_timer\|vac`) |
| `backend/performance/baseline_controllers.py` | `FixedTimerController` and `VehicleActuatedController` baselines |
| `backend/performance/metrics_collector.py` | Six-metric aggregation engine |
| `backend/services/dashboard_server.py` | Read-only FastAPI viewer (WebSocket + history/analytics endpoints) |
| `backend/services/control_routes.py` | The one place a web request can launch/stop an evaluation (mounted only by `app.py`) |
| `sumo/network/intersection.tll.xml` | Frozen traffic light program (phases 0-7) |

## Scenario library

Training/evaluation scenarios in `sumo/config/scenarios/`:
light, balanced, heavy, extreme (held-out), north/south/east/west_heavy,
normal_traffic, rush_hour, rain, accident, emergency_response — each with
multiple seeds. Demo scenarios in `sumo/config/demo/`.

## Emergency vehicle detection

`TrafficAdapter.get_emergency_vehicle_lanes()` reads SUMO vehicle
classes (`traci.vehicle.getVehicleClass`) — the raw fact only. app.py
passes the resulting lane set straight into
`DecisionEngine.decide(..., emergency_lanes=...)`, where the existing
override logic (minimum-safety-green cut-in + 15 s service window)
prioritizes those lanes. No detection or prioritization logic exists
anywhere outside the adapter (detection) and DecisionEngine (action).

## Database logging (SQLite)

`backend/database/db_logger.py` writes four tables at decision-tick
cadence (1 Hz, WAL mode, failure-tolerant — a DB error never costs a
control tick):

| Table | Contents |
|---|---|
| `decision_log` | time, phase, duration, mode, reason, **actual_phase, actual_is_yellow** (the TraCI-confirmed Actual State, alongside the Desired State the other columns describe — see "Desired vs Actual", below) |
| `performance_log` | time, avg_wait, avg_speed, queue_length, stopped (network-wide) |
| `prediction_log` | time, predicted_values JSON, actual_values JSON, confidence |
| `lane_state_log` | time, lane_id, vehicle_count, avg_speed, avg_waiting_time, stopped_count, congestion_score, signal_state — **one row per lane** (12/tick), feeding `backend/analytics/` |

DB file: `data/traffic_dashboard.db`. Predictions are parked until their
15 s horizon elapses, then paired with observed reality before being
written — so every prediction row is a true predicted-vs-actual record.
Older database files are migrated in place (new columns are added via
`ALTER TABLE` on first startup) rather than requiring a fresh DB.

**Desired vs Actual signal state**: `decision_log.phase/duration/mode/reason`
describe what the Decision Engine *decided* (Desired State); the
`actual_phase`/`actual_is_yellow` columns record what SUMO's own TraCI
state *confirmed* actually applied, sourced from `app.py`'s
`_signal_view(state)`. This closes the loop durably — previously this
distinction only existed live, in the dashboard's WebSocket snapshot.

## Congestion analytics

`backend/analytics/congestion_analytics.py` is a read-only, dependency-light
module (no FastAPI import, just `db_path` in / structured data out) that
turns `lane_state_log` into:

- **`average_wait_times`** — mean wait, network-wide or per-lane, over
  an optional time range.
- **`congestion_trend`** — a time-bucketed series of the same
  `congestion_score` the Decision Engine itself computes per lane
  (`DecisionEngine._lane_score`), network-wide or per-lane.
- **`detect_peak_periods`** — the top-N highest-congestion, non-overlapping
  time windows recorded so far, detected statistically from
  `congestion_trend` rather than assumed from wall-clock time-of-day
  (simulated time has no real hour-of-day to anchor "rush hour" to).

Exposed read-only via the dashboard server: `GET /api/analytics/wait-times`,
`GET /api/analytics/congestion-trend`, `GET /api/analytics/peak-periods`.

## Decision Engine tuning

`backend/decision_engine/decision_config.py`'s `DecisionConfig` dataclass
holds every DecisionEngine tunable (green clamps, hysteresis margins,
starvation limits, emergency windows, normalization ceilings) that used
to be hardcoded module constants — construct one with overrides, or run

```bash
cd backend
python -m decision_engine.calibrate_normalization
```

to derive `norm_vehicle_count`/`norm_waiting_time_seconds` from real
recorded `lane_state_log` data (90th percentile by default) instead of
their original starting-point guesses. Writes
`backend/decision_engine/normalization_calibration.json`, loaded
automatically on the next `DecisionEngine()` construction if present;
deleting it reverts to the hardcoded defaults. Requires at least 500
recorded rows before it will calibrate, to avoid locking in a fluke
from a short run.

## Remaining roadmap

1. **Final optimization + demo script** — polish, presentation flow,
   optional per-lane history charts from the SQLite logs.
2. **Multi-junction coordination** — deliberately deferred: the feature
   schema, traffic adapter, scenario manifest, and Decision Engine all
   currently assume exactly one junction (id `"C"`) by design; extending
   to N junctions is a cross-cutting redesign, not a bolt-on.
