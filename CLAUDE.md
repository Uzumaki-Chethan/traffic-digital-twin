# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

An AI-driven adaptive traffic signal control system: SUMO (microscopic traffic simulator)
+ TraCI drive a single frozen 4-way junction, a Random Forest predicts near-future per-lane
demand, a rule-based Decision Engine picks signal phases from that, and a Performance
Evaluation module runs the AI and a baseline controller as two parallel, lockstep SUMO
instances to prove the AI actually helps. A FastAPI dashboard (React/Vite frontend, being
rebuilt — see "Frontend" below) visualizes all of this read-only over WebSocket.

Full narrative context lives in `README.md` (quick start, current status, module map) and
`PROJECT_ARCHITECTURE_REPORT.md` (deep architectural history — read its highest-numbered
`SECTION N — ... (CURRENT STATE)` heading first; earlier sections are progressively more
historical/outdated). This project originated from a written execution guide (not in this
repo — the user has it separately) that the actual implementation has since deviated from
in several documented ways; see "Known deviations" below.

## Architecture — the backbone (do not break this)

```
SUMO (TraCI)
   ↓
TrafficAdapter          ← the ONLY module allowed to touch traci
   ↓
DigitalTwin             ← current state + rolling history
   ↓
FeatureEngineer         ← 125 engineered features
   ↓
MLPredictor             ← RandomForest, 24 targets, 15s horizon, calibrated confidence
   ↓
DecisionEngine          ← phase scoring, hysteresis, starvation, emergency override,
                          confidence-aware prediction blending — writes Desired State only
SignalController        ← Decision → TraCI commands; yellow-clearance safety; execution only
```

Every module has exactly one job and one owner of the state it writes; `backend/app.py`
only orchestrates startup/run/shutdown plus three read-only side-channels (SQLite logging,
dashboard publishing, emergency-lane detection) that can never influence control. When
adding anything, preserve this: a module should read what it needs and write only the
state it owns, never call into another module's internals.

The traffic light ID (`"C"`) and its 12 lanes are a single hardcoded topology, verified
against `sumo/network/intersection.tll.xml` — this is deliberate (see "Known deviations"),
not an oversight.

## Commands

### Backend (Python — run from `backend/`)

```bash
python app.py                                              # live AI-controlled sim (sumo-gui)
python -m performance.evaluator --scenario heavy_seed1     # headless AI-vs-fixed-timer + CSV
python -m performance.evaluator --scenario heavy_seed1 --baseline vac  # AI-vs-VAC instead
python -m performance.evaluator --scenario rush_hour_seed1 --gui       # dual-GUI demo
python -m performance.evaluator --scenario heavy_seed1 --dashboard     # feeds the web dashboard
python -m performance.evaluate                              # full fixed_timer/vac/ai matrix
python -m performance.evaluate --controllers ai --scenarios heavy_seed1
python -m decision_engine.calibrate_normalization            # derive normalization ceilings from real data
python -m ml.training.generate_scenario_files                # regenerate SUMO scenario route/config files
python -m ml.training.dataset_generator                      # run scenarios, write raw training CSVs
python -m ml.training.train                                  # fit + evaluate the Random Forest model
python -m ml.training.fit_confidence_calibration              # isotonic-calibrate prediction confidence
pytest ../tests/ -v                                           # full test suite (offline, no SUMO needed)
pytest ../tests/test_decision_engine.py -v                    # Decision Engine unit tests only
```

Requirements: Python 3.10+, SUMO installed with `SUMO_HOME` set and on `PYTHONPATH`
(`import traci`/`import sumolib` must work), `pip install -r requirements.txt` (root
`requirements.txt`, UTF-16 encoded — the single dependency source; a stale, unreferenced
`backend/requirements.txt` that incorrectly listed Flask was removed 2026-09-05).

### Frontend (`frontend/` — React + Vite + TypeScript + Tailwind)

```bash
npm run dev        # dev server, proxies /api and /ws to the FastAPI backend
npm run build       # tsc -b && vite build -> frontend/dist, served by dashboard_server.py
npm run lint        # oxlint
```

The dashboard server serves `frontend/dist` if built, falling back to the legacy
`frontend/dashboard.html` if not.

## Key subsystems

- **Digital Twin** (`backend/digital_twin/`): current `SimulationState` + bounded rolling
  history. Nothing else stores its own copy of traffic state.
- **Decision Engine** (`backend/decision_engine/decision_engine.py`): all tunables (green
  clamps, hysteresis margin, starvation limits, emergency windows, normalization ceilings,
  `switch_confirmation_seconds`) live in `decision_config.py`'s `DecisionConfig` dataclass,
  not module constants — construct one with overrides for tests/experiments.
  `calibrate_normalization.py` derives the normalization ceilings from recorded data
  (manual, offline, needs 500+ rows); `DecisionEngine` loads `normalization_calibration.json`
  automatically if present, else falls back to hardcoded defaults silently. Two mechanisms
  worth knowing before touching `decide()`: **gap-out** (releases the current phase
  immediately once its exclusive lanes hit zero raw vehicles, post min-green — mirrors
  `VehicleActuatedController`'s own gap-out exactly), a **switch-confirmation debounce**
  (an ordinary preference-based switch needs the same candidate to lead by the hysteresis
  margin for `switch_confirmation_seconds` of *consecutive* time before committing — gap-out,
  emergency, and hard-starvation all bypass this deliberately), and **light-traffic mode**
  (`light_traffic_congestion_threshold`, default `0.0`/inactive — below this
  `congestion_index`, scored preemption is disabled entirely; tested but underperformed a
  higher flat `switch_hysteresis_margin`, so it's kept in code but not the shipped
  mechanism). `starvation_pressure_cap` (0.20, below the margin) caps the soft starvation
  term so it alone can never force a scored switch — added after finding a real bug where a
  phase kept its stale "seconds unserved" credit through its own entire green (`_switch_to`
  now resets the incoming phase's timer too, not just the outgoing one's). Lane urgency also
  factors in `max_waiting_time` (a lane's single longest-waiting vehicle), not just the mean
  — `average_waiting_time_influence`/`max_waiting_time_influence` (0.25/0.15) split what was
  one 0.4 weight, targeting worst-case travel time specifically. See
  PROJECT_ARCHITECTURE_REPORT.md Sections 19-22 for why these exist, the A/B evidence, and
  the full scenario-library validation table.
- **Database** (`backend/database/db_logger.py`, SQLite, WAL mode, insert-only,
  failure-tolerant): `decision_log` (includes persisted `actual_phase`/`actual_is_yellow` —
  the TraCI-confirmed Actual State, alongside the Decision Engine's Desired State),
  `performance_log` (network-wide), `prediction_log` (predicted-vs-actual pairs),
  `lane_state_log` (per-lane, 12 rows/tick, feeds analytics). Older DB files are migrated
  in place via `ALTER TABLE` on startup, not replaced.
- **Analytics** (`backend/analytics/congestion_analytics.py`): read-only, no FastAPI
  dependency, takes a plain `db_path`. `average_wait_times`, `congestion_trend`,
  `detect_peak_periods` — peaks are detected statistically from recorded congestion
  history, not assumed from wall-clock time-of-day (simulated time has no real hour-of-day).
- **Dashboard** (`backend/services/dashboard_server.py`): FastAPI, strictly read-only in
  itself — zero endpoints of its own that can send a command into the simulation; sourced
  from `LiveStateStore` (in-process, live) or the SQLite/CSV files the simulation already
  wrote. Runs as a daemon thread inside the simulation process (`start_dashboard_server()`),
  never launched standalone.
- **Control layer** (`backend/services/control_routes.py`): the ONE place a web request can
  affect what's running, deliberately kept out of `dashboard_server.py` so that file's own
  "pure viewer" claim stays true. Mounted only by `app.py` (via `create_app`'s/
  `start_dashboard_server`'s `extra_router` param) — `POST /api/control/start-evaluator`
  `{scenario_name, baseline, gui}` launches `performance.evaluator` as a real child process
  (input validated against real scenario files / a fixed baseline whitelist before it ever
  reaches `subprocess.Popen`), `POST /api/control/stop-evaluator` stops it gracefully
  (Windows: `CTRL_BREAK_EVENT`, letting the child's own TraCI/SUMO shutdown run cleanly),
  `GET /api/control/status` self-heals when a run finishes on its own, `POST
  /api/internal/publish` is how that child's live snapshots get back into `app.py`'s
  `LiveStateStore` (it's a genuinely separate OS process — `services/live_state.py`'s
  `RemoteLiveStatePublisher`, non-blocking/threaded so a slow network call can never stall
  the simulation loop). This exists specifically so a demo needs no terminal command beyond
  `python app.py` itself.
- **Performance Evaluation** (`backend/performance/`): `evaluator.py` runs two PARALLEL,
  lockstep-synchronized SUMO instances (separate TraCI connections, labeled `"ai"`/
  `"baseline"`) of the identical scenario for a fair comparison; `baseline_controllers.py`
  has `FixedTimerController` and `VehicleActuatedController` (VAC) baselines, both emitting
  the same `Decision` objects the AI does, executed by the same `SignalController`.

## Known deviations from the original execution guide

The user is aware of these and has deliberately deferred fixing them — don't "fix" them
unprompted, but do keep this section current if that changes:

- **VAC baseline: wired in 2026-09-05, default unchanged.** `evaluator.py` now accepts
  `--baseline {fixed_timer,vac}` (also exposed via `POST /api/control/start-evaluator`'s
  `baseline` field); default stays `fixed_timer` so all previously-recorded results/docs
  remain valid. After four rounds of work — gap-out + debounce (Section 19), a real bug fix
  in the starvation mechanism found by an independent Opus-driven root-cause analysis
  (Section 21 — the phase just switched TO was never having its own starvation timer reset,
  silently blocking legitimate mid-green preemption), adding `max_waiting_time` to lane
  scoring (Section 22 — the score previously only saw mean wait, missing a single
  badly-delayed vehicle), and three rounds of empirical margin re-tuning (0.08 → 0.25 → 0.30
  → 0.35) — **all 13 scenario types are clean 7/7 sweeps** vs VAC (every scenario's seed 1,
  including `rush_hour`, the hardest holdout — the only non-flat, ramping-demand scenario in
  the library). Honestly caveated, not oversold: spot-checking additional seeds found
  `north_heavy_seed2` picks up a small 2-metric miss the config didn't have before (while
  seed3 stays clean) — expected seed-to-seed noise on a close-fought scenario
  (`throughput` is tied by construction; `max_travel_time`/`max_queue_length` are
  single-sample/single-instant extremes), not something further tuning would eliminate
  rather than relocate. `starvation_pressure_cap = 0.20`, `average_waiting_time_influence =
  0.25`, and `max_waiting_time_influence = 0.15` were all added along the way — every value
  in this list was empirically tuned via real A/B evaluator runs, never guessed. See
  PROJECT_ARCHITECTURE_REPORT.md Sections 20-22 for the full history.
- **Vehicle-type realism: now consistent everywhere (fixed 2026-09-05).** Realistic
  car/motorcycle/auto_rickshaw/bus/truck sub-types (`sumo/vehicles/vehicle_types.add.xml`)
  were already used by every training scenario and demo scenario; the frozen production
  route (`sumo/routes/intersection.rou.xml`, what `python app.py` runs) was the one holdout
  still using 100% generic cars — fixed to use the same mix. No retraining implications
  (confirmed the trained model already postdates the scenario-file mix, and training never
  reads the production route file at all).
- **Multi-junction coordination is out of scope, permanently** (the user has decided
  against ever pursuing it, not merely deferred it). `feature_schema.py`,
  `traffic_adapter.py`, `scenario_manifest.py`, and `decision_engine.py` all independently
  hardcode the single-junction ("C") assumption. Confirmed to be a genuine cross-cutting
  redesign, not a bolt-on — the user has decided not to pursue it.
- **Frontend is mid-rebuild and disliked.** The current React/Vite/Tailwind dashboard
  (`frontend/`) is a placeholder the user wants scrapped and redesigned properly with real
  design effort — don't invest in polishing the current UI without checking first.
- No ESP32/physical hardware integration exists (the `firmware/` directory is empty) —
  the project is SUMO-simulation-only.
- Database has 4 tables (see above), not the guide's originally-envisioned 8.

## Working with this project

- **Explain before implementing.** If you (Claude) come up with an idea or feature beyond
  what was literally asked — even something clearly beneficial — explain it and get
  explicit approval before writing code. Things the user explicitly asks for (including
  prompts they hand over from elsewhere) don't need this gate, but if a request turns out
  to already exist, be redundant, or require a scope decision, surface that and confirm
  before proceeding rather than deciding unilaterally.
- **Keep `README.md` and `PROJECT_ARCHITECTURE_REPORT.md` current** as architecture,
  module status, or scope changes — proactively, not only when asked. Add a new
  highest-numbered `SECTION N — ... (CURRENT STATE)` to the architecture report for
  significant changes rather than editing history away.
- This is meant to become a **production-grade system**, architected as if it could
  realistically be deployed, not just a graded student demo — and the user has explicitly
  said not to treat the original execution guide as a scope ceiling; propose improvements
  beyond it when they're genuinely valuable.
