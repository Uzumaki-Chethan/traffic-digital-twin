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

# headless comparison + CSV
python -m performance.evaluator --scenario heavy_seed1

# dual-GUI demo mode (two windows side by side)
python -m performance.evaluator --scenario rush_hour_seed1 --gui
```

Output example:

```
=== AI vs Baseline - light_seed1 ===
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

The dashboard is strictly READ-ONLY: it is fed by an in-process snapshot
store (`services/live_state.py`) over WebSocket; no endpoint can send a
command into the simulation.

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
4. **Baseline = pure SUMO default**: the baseline connection NEVER
   receives a trafficlight command; its frozen static program runs
   untouched. No DecisionEngine, no SignalController on that side.
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
| `backend/decision_engine/` | Phase scoring, hysteresis, starvation, emergency logic |
| `backend/signal_controller/` | Decision → safe TraCI execution (yellow clearance) |
| `backend/performance/evaluator.py` | Parallel AI-vs-baseline evaluator |
| `backend/performance/metrics_collector.py` | Six-metric aggregation engine |
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

`backend/database/db_logger.py` writes three tables at decision-tick
cadence (1 Hz, WAL mode, failure-tolerant — a DB error never costs a
control tick):

| Table | Contents |
|---|---|
| `decision_log` | time, phase, duration, mode, reason (per decision) |
| `performance_log` | time, avg_wait, avg_speed, queue_length, stopped |
| `prediction_log` | time, predicted_values JSON, actual_values JSON, confidence |

DB file: `data/traffic_dashboard.db`. Predictions are parked until their
15 s horizon elapses, then paired with observed reality before being
written — so every prediction row is a true predicted-vs-actual record.

## Remaining roadmap

1. **Final optimization + demo script** — polish, presentation flow,
   optional per-lane history charts from the SQLite logs.
