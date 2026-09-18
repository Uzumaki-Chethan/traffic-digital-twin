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
MLPredictor             ← RandomForest, 24 residual targets (predicts the
   ↓                       change over 15s, adds the current value back),
                           isotonic-calibrated confidence
DecisionEngine          ← phase scoring, min/max green, hysteresis,
   ↓                       starvation handling, emergency override,
                          confidence-aware prediction blending
SignalController        ← Decision → TraCI commands; yellow-clearance
                          safety; execution only, zero logic
```

This separation is intentional and graded. Every module has one job;
`simulation_runner.py` only orchestrates startup / run / shutdown, and the
two entry points (`app.py` for one terminal run, `server.py` for the
always-on console) both just call it.

## Project status

| Stage | Status |
|---|---|
| Traffic simulation (multi-scenario, multi-seed) | ✔ done |
| Dataset + training (Test MAE ≈ 1.44, held-out ≈ 1.49, extreme ≈ 1.73; persistence 2.72 / 4.31) | ✔ done |
| ML predictor (125 features → 24 residual targets, calibrated confidence) | ✔ done |
| Decision Engine (core intelligence) | ✔ done |
| Signal Controller | ✔ done |
| Closed-loop integration (`app.py`) | ✔ done |
| **Performance Evaluation (AI vs baseline)** | ✔ **done** |
| **Real-time Dashboard** | ✔ **done** |
| **Emergency vehicle detection** | ✔ **done** |
| **Database logging (SQLite)** | ✔ **done** |
| Final optimization + demo polish | ⬜ |

Full engineering context and history: see `PROJECT_ARCHITECTURE_REPORT.md`
(read the highest-numbered `SECTION N ... (CURRENT STATE)` first — Section 30
as of 2026-09-17). The tag **`prototype-1`** (2026-09-17) is the first complete
prototype and the revert point; UI work from here follows
`docs/UI_CHANGE_RULES.md` (restyle and move freely, never lose information).

---

## Quick start

Requirements: Python 3.10+, SUMO installed with `SUMO_HOME` set,
`pip install -r requirements.txt`.

### Run everything from the browser (recommended)

```bash
cd backend
python server.py          # then open http://127.0.0.1:8000
```

The console stays up and you drive it from the web UI: **Start** launches
a simulation (headless by default — the page draws the junction itself,
in plan view and in 3D, with the real vehicles), **Start with SUMO
window** opens sumo-gui alongside it, and Pause / Play / Stop sit in the
top bar. The speed control cycles on click or slides on hover, from
0.25x real time to unthrottled. The bar belongs to the page: on
Performance it starts and drives the Trinetra-vs-VAC evaluation, on
Overview and Analytics the demo run, and on Simulation Settings whichever
page its dropdown names (and then takes you there). The console runs one
thing at a time, so if the other kind of run is up, Start ends it first
and then starts this page's — the tooltip says so. A "Scenario: …" chip
beside the controls names the page's scenario and links to Settings.

A headless run can be moved into a SUMO window at any point with **Open
window**: the run saves its state and resumes from it, so the same
vehicles, signal and clock carry across — it is the same run continuing,
not a restart. Stopping leaves the console up, so you can start another
without touching the terminal.

During frontend development run `npm run dev` in `frontend/` as well and
use http://localhost:5173 instead — it proxies `/api` and `/ws` here.

### Run one simulation from the terminal (GUI)

```bash
cd backend
python app.py
```

Opens a sumo-gui window; the AI decides at 1 Hz, logs status once per
second, and controls the junction through safe yellow-clearance
transitions. (The console keeps the 258 MB Random Forest loaded between
runs, so a Start there reaches its first tick in about a second; a
terminal run loads it once, ~5 s.) The dashboard runs inside this process, so it can pause and
stop the run but cannot start another — and when this run ends, the
dashboard ends with it. That is what `server.py` above exists to fix.

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

**Result against `--baseline vac`** (measured 2026-09-13 on the current configuration:
protected left turns, the retrained residual model, and the final Decision Engine — see
PROJECT_ARCHITECTURE_REPORT.md Section 26 for the complete story and every intermediate
number):

| scenario (seed 1) | wins | wait | travel | worst travel | avg queue | max queue | speed | throughput |
|---|---|---|---|---|---|---|---|---|
| `light` | **7/7** | +7.1 % | +0.3 % | +7.8 % | +0.7 % | +0.0 % | +1.6 % | +0.0 % |
| `balanced` | **7/7** | +17.8 % | +1.1 % | +2.1 % | +3.8 % | +0.0 % | +1.6 % | +0.0 % |
| `normal_traffic` | **7/7** | +86.2 % | +34.7 % | +70.3 % | +65.2 % | +61.4 % | +46.9 % | +0.0 % |
| `heavy` | **7/7** | +66.5 % | +20.5 % | +40.2 % | +46.0 % | +30.2 % | +24.7 % | +0.0 % |
| `extreme` | **7/7** | +64.1 % | +37.3 % | +57.4 % | +51.5 % | +50.0 % | +45.5 % | +0.0 % |
| `rush_hour` | **7/7** | +58.4 % | +10.8 % | +43.8 % | +25.9 % | +34.4 % | +10.9 % | +0.0 % |
| `north_heavy` | **7/7** | +57.0 % | +10.5 % | +43.9 % | +29.3 % | +11.4 % | +9.1 % | +0.0 % |
| `south_heavy` | **7/7** | +61.5 % | +8.8 % | +42.4 % | +26.4 % | +7.5 % | +9.5 % | +0.0 % |
| `east_heavy` | **7/7** | +61.9 % | +15.4 % | +41.3 % | +36.9 % | +3.2 % | +18.6 % | +0.0 % |
| `west_heavy` | **7/7** | +63.8 % | +14.8 % | +43.1 % | +37.6 % | +21.1 % | +16.1 % | +0.0 % |
| `accident` | **7/7** | +83.8 % | +34.0 % | +70.2 % | +62.5 % | +54.7 % | +41.3 % | +0.0 % |
| `emergency_response` | **7/7** | +83.0 % | +30.0 % | +62.6 % | +57.8 % | +45.9 % | +38.8 % | +0.0 % |
| `rain` | **7/7** | +85.7 % | +35.6 % | +66.2 % | +67.5 % | +64.5 % | +46.4 % | +0.0 % |

**13/13 clean sweeps — every scenario, every metric.** Twelve of the thirteen `results/
comparison_<scenario>_seed1.csv` files were written by one run on 2026-09-14, after the
performance work of Section 28 (the whole sweep now takes ~6 minutes; metrics are sampled
once per decision tick, so these differ from the 2026-09-13 table only by sampling noise);
`emergency_response` was re-measured on 2026-09-18 after the evaluator was found to be
withholding emergency-vehicle detection from the AI side (Section 30.17) — with the
override active the AI serves the ambulances and gives back a few points on the other
metrics, as it should. The AI
switches less than VAC in every light seed (64 vs 74, 58 vs 67, 65 vs 75) and, under
saturation, holds a phase serving a stream for at least ~17 s of real green before any
score can end it. Throughput is tied by construction in every row; the two 0.0 max-queue
entries (`light`, `balanced`) are exact ties, 31 vs 31 vehicles.

Multi-seed spot checks with this configuration: `light_seed2` 7/7, `light_seed3` 5/7
(travel −0.1 %, speed −1.2 %), `east_heavy_seed2` 7/7, `east_heavy_seed3` 7/7. As in
Section 22.3, a literal "every seed of every scenario" guarantee is not claimed.

How it got here, in one paragraph each (Sections 19–22 and 26):

1. **Gap-out, switch-confirmation debounce, a starvation-timer bug fix, max-wait scoring**
   (Sections 19–22) — the original road to 13/13 under the old shared-left program.
2. **Protected left turns** (Section 25) changed the signal program, which made the old
   model out of distribution and the old sweep stale. Everything below was done to close
   that.
3. **The model now predicts residuals** — the *change* over 15 s, added to the current
   value — instead of absolute levels, which the forest could not extrapolate (it was worse
   than "assume nothing changes" on vehicle counts). Test MAE 1.44 / held-out 1.49, from
   2.06 / 2.35 on the same data (Section 26.2–26.3).
4. **`seconds_until_next_signal_switch` was a train/serve deviation** — a real countdown in
   training data, a re-armed 60 s ceiling at run time — on the model's most important
   feature. Replaced by `seconds_in_current_phase`, a phase clock the adapter keeps. This
   alone was the light-traffic loss: with the model's influence switched off the AI won
   6/7; with the skewed model, 3/7 (Section 26.4).
5. **Gap-out chooses the next phase by present vehicle count** (VAC's own rule), never by a
   forecast — a phase with nobody at the line but a predicted arrival could outrank a phase
   with a vehicle actually stopped (Section 26.4a).
6. **A realistic-green floor**: a phase still serving substantial demand holds ≥ 20 s (≈17 s
   of real green) before a score can take it away. The user rejected 10–15 s greens as
   unrealistic; this fixed `east_heavy` and made `extreme` markedly stronger (Section 26.4b).
7. **Travel time excludes scheduled `<stop>` time** (SUMO's own convention for waiting
   time): `accident`'s worst-travel metric was the scripted 550 s stall under both
   controllers; it now measures the worst real journey — 169 s vs VAC's 514 s.

Every value in `DecisionConfig` was set by real A/B evaluator runs against VAC, never
guessed, and every mechanism that was tried and lost (a lower starvation cap, a shared
longer minimum green, starvation gated on demand, a light-traffic gate, a longer
confirmation window, a round-robin tie-break) is recorded in Section 26.4b with its numbers.


### The web console

`python server.py` serves the React UI and the read-only API on
http://127.0.0.1:8000. `python app.py` serves the same UI from inside
the simulation process.

Five pages:

- **Overview** — the junction itself, in a true-scale plan view (a map's
  zoom: Ctrl + scroll or pinch, drag, 1× = the whole network, opens at 3.5×
  with a button that returns there; a plain scroll scrolls the page) or an
  interactive 3D miniature (drag to orbit, Ctrl + scroll to zoom), both
  drawing the real SUMO vehicles at their real size — emergency vehicles with
  blinking light bars — and a **Dispatch** bar to send an ambulance, fire
  engine or police car in from any approach while a run is live (on
  Performance it enters both simulations at once); active phase with its decision mode and reason;
  the twelve lanes with live signal state; **Why this phase** (the four phase
  scores against the switch boundary — the engine's own margin, drawn) and
  the last five switches with their rule; a 60 s phase-history band; and
  the network metrics strip.
- **Analytics** — the run happening right now, in detail: lane pressure
  as a lane-by-time heatmap, the lane ledger, network waiting time and
  queue length over simulated time, congestion by time bucket, the share
  of decisions by mode and by phase, the spread of green durations, and
  speed against waiting time as a scatter. Everything comes from the live
  WebSocket stream, so this page needs a simulation running and says so
  when there is not (with a Start button). The database is still being
  written throughout; it is just not what this page reads.

- **Performance** — Trinetra against vehicle-actuated control on the
  *identical* scenario, live: two junctions side by side, each driven by
  its own simulation in lockstep, and below them one block per evaluation
  metric — a line of each controller over simulated time, both current
  values, and a verdict ("Trinetra ahead 62 %", "Even", "VAC ahead 3 %")
  that reads "so far" while running and "final" when the run ends. Each
  junction has its own zoom and pan; a Match button on either copies the
  other's framing across. Before an evaluation the page keeps its shape —
  two dark junctions, seven empty blocks — and the top bar's Start fills
  it in. The same Pause / Stop / speed bar drives it. An evaluation that runs to its
  end also writes `results/comparison_<scenario>.csv`, exactly as a
  terminal run does; one stopped early does not.
- **Simulation Settings** — the thirteen scenarios as cards with
  plain-language names ("Rush hour", "Stalled truck on East") and one-line
  descriptions, shown once; a dropdown says whether a click chooses for
  Overview or for Performance, and each card marks the page(s) currently
  set to run it. Overview starts on Balanced traffic, Performance on
  Extreme. The choice persists in the browser and applies the next time
  that page's Start is pressed — including the top bar's Start on this
  page, which runs the chosen page's scenario and goes there.
  The console runs one thing at a time: starting an evaluation while a
  demo is up (or the reverse) is refused with a sentence saying so.

- **Decisions** — the audit trail: every decision of a run, from the
  database (the one page that can show a run after it has ended, or an
  earlier one). A run picker, the rules as filter chips with counts, a
  dense list, and the opened decision with its full reason, what the
  light was actually showing, and the score ledger as it stood on that
  tick. Follows the live run as it writes.

For the AI-vs-baseline comparison panel during evaluation runs:

```bash
cd backend
python -m performance.evaluator --scenario heavy_seed1 --dashboard
# open http://127.0.0.1:8000 — watch % improvements converge live
```

`services/dashboard_server.py` itself remains strictly READ-ONLY: it is
fed by an in-process snapshot store (`services/live_state.py`) over
WebSocket — one frame per simulation tick at any speed (≤ 30/s), with a
0.5 s heartbeat while nothing changes — and defines zero endpoints that
can send a command into the simulation. Both hosts additionally mount one narrowly-scoped control
layer on top of it — pause/resume/stop/speed everywhere, plus
start/stop-simulation in `server.py`, which is the only one that outlives
a run. That capability lives entirely in a separate module,
`services/control_routes.py`, so `dashboard_server.py`'s own claim about
itself stays true; a standalone `python -m performance.evaluator
--dashboard` never gains it, and the UI discovers which controls are
actually available from `GET /api/control/run-state` rather than assuming.

### Start, pause and stop from HTTP

What the buttons in the top bar do, if you would rather script it:

```bash
curl -X POST http://127.0.0.1:8000/api/control/start-simulation \
     -H "Content-Type: application/json" -d '{"gui": false}'

curl -X POST http://127.0.0.1:8000/api/control/pause
curl -X POST http://127.0.0.1:8000/api/control/resume
curl -X POST http://127.0.0.1:8000/api/control/speed \
     -H "Content-Type: application/json" -d '{"multiplier": 5}'
curl -X POST http://127.0.0.1:8000/api/control/stop-simulation
curl http://127.0.0.1:8000/api/control/run-state
```

`multiplier` is simulated seconds per wall-clock second; `null` means
unthrottled. This matters for headless runs, which otherwise step at
roughly a hundred times real time.

### Run an evaluation without touching a terminal

The dashboard can launch and stop a Performance Evaluation itself — no
second terminal command needed:

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

Every row carries `run_id` (the run's start time). A new run prunes runs
older than the newest `Config.DB_KEEP_RUNS` (10) and vacuums the file,
and every read — `/api/logs/*` (`?run=`, default the newest;
`/api/logs/runs` lists them) and `/api/analytics/*` — answers for one
run, so a run's history is never mixed with an earlier one's.

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
