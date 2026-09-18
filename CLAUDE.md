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
MLPredictor             ← RandomForest, 24 targets, 15s horizon, RESIDUAL targets
                          (predicts the change, adds the current value back), calibrated
                          confidence from tree spread
   ↓
DecisionEngine          ← phase scoring, hysteresis, starvation, emergency override,
                          confidence-aware prediction blending — writes Desired State only
SignalController        ← Decision → TraCI commands; yellow-clearance safety; execution only
```

Every module has exactly one job and one owner of the state it writes;
`backend/simulation_runner.py` only orchestrates startup/run/shutdown plus three read-only
side-channels (SQLite logging, dashboard publishing, emergency-lane detection) that can
never influence control. The one thing that CAN influence a run is `RunControl`
(pause/resume/stop/speed), deliberately a separate single-purpose object. `backend/app.py`
and `backend/server.py` are the two entry points, and both just call `run_simulation()`.
When adding anything, preserve this: a module should read what it needs and write only the
state it owns, never call into another module's internals.

The traffic light ID (`"C"`) and its 12 lanes are a single hardcoded topology, verified
against `sumo/network/intersection.tll.xml` — this is deliberate (see "Known deviations"),
not an oversight.

**Editing the signal program:** `intersection.tll.xml` is a netconvert SOURCE and is NOT
loaded at run time. `intersection.sumocfg` loads the compiled `intersection.net.xml`, which
carries its own copy of the `<tlLogic>`. Change BOTH or the change does nothing — and the
phase/lane structure is also encoded a third time in `decision_engine._PHASE_EXCLUSIVE_LANES`,
which `baseline_controllers.py` imports.

## Commands

### Backend (Python — run from `backend/`)

```bash
python server.py                                           # console: serves the UI, starts/stops runs from the browser
python app.py                                              # live AI-controlled sim (sumo-gui), one run, dashboard dies with it
python -m performance.evaluator --scenario heavy_seed1     # headless AI-vs-fixed-timer + CSV
python -m performance.evaluator --scenario heavy_seed1 --baseline vac  # AI-vs-VAC instead
python -m performance.evaluator --scenario rush_hour_seed1 --gui       # dual-GUI demo
python -m performance.evaluator --scenario heavy_seed1 --dashboard     # feeds the web dashboard
python -m performance.evaluate                              # full fixed_timer/vac/ai matrix
python -m performance.evaluate --controllers ai --scenarios heavy_seed1
python -m decision_engine.calibrate_normalization            # derive normalization ceilings from real data
python -m ml.training.generate_scenario_files                # regenerate SUMO scenario route/config files
python -m ml.training.dataset_generator                      # run scenarios, write raw training CSVs
python -m ml.training.train                                  # fit + evaluate the Random Forest model (residual targets)
python -m ml.training.fit_confidence_calibration              # isotonic-calibrate prediction confidence
pytest ../tests/ -v                                           # full test suite (offline, no SUMO needed)
pytest ../tests/test_decision_engine.py -v                    # Decision Engine unit tests only
```

Requirements: Python 3.10+, SUMO installed with `SUMO_HOME` set and on `PYTHONPATH`
(`import traci`/`import sumolib` must work), `pip install -r requirements.txt` (root
`requirements.txt`, UTF-16 encoded — the single dependency source; a stale, unreferenced
`backend/requirements.txt` that incorrectly listed Flask was removed 2026-09-05).

### Frontend (`frontend/` — React + Vite + TypeScript + Tailwind v4; see "Known deviations")

```bash
npm run dev        # dev server, proxies /api and /ws to the FastAPI backend
npm run build       # tsc -b && vite build -> frontend/dist, served by dashboard_server.py
npm run lint        # oxlint
```

The dashboard server serves `frontend/dist` if built, falling back to a plain
"no frontend build found" placeholder if not (the legacy single-file
`frontend/dashboard.html` this used to fall back to was removed when the React
frontend replaced it; the dead fallback code path was cleaned up 2026-09-06).

## Key subsystems

- **Traffic Adapter** (`backend/traffic_adapter/adapter.py`): the only traci caller. Since
  2026-09-14 it reads through TraCI **subscriptions** (one message per step for the whole
  fleet, type/class cached per vehicle) and the pipeline runs at the **1 Hz decision
  cadence** (`TraCIManager.run(callback_interval_seconds=...)`) rather than every 0.05 s
  step — a 9x speed-up that left training rows byte-identical. Two rules that follow:
  anything that reads state less often than every step must call `adapter.observe_step()`
  after EVERY step (it accumulates SUMO's last-step-only departed/arrived/stop lists), and
  decision ticks must stay on the same simulated times (0.05, 1.05, …) or the AI's
  decisions change. Section 28.
- **Digital Twin** (`backend/digital_twin/`): current `SimulationState` + bounded rolling
  history. Nothing else stores its own copy of traffic state.
- **ML model loading** (`backend/ml/ml_predictor.py`): `MLPredictor.from_path` caches the
  deserialised 258 MB forest + calibrators + metadata per process, keyed on all three
  files' path/size/mtime; `server.py` warms it on a thread at start so a console Start
  reaches its first tick in ~1.4 s instead of 5-7. The forest is read-only at inference,
  so sharing it across runs (and the evaluator's two sides) is safe.
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
  one 0.4 weight, targeting worst-case travel time specifically. **Gap-out's choice of NEXT
  phase is count-first** (`gap_out_uses_present_demand`, on since 2026-09-13): it ranks the
  alternatives by present vehicle count — VAC's own rule — with the wait-aware score only
  breaking ties, and never with the prediction blended in. That was the whole light-traffic
  loss: with blended scores, a phase with nobody waiting but a forecast arrival could
  outrank a phase with a vehicle actually stopped. `starvation_requires_demand` (starvation
  pressure/override only for phases with vehicles) looked right and lost on every light seed
  — kept in code, default off, like the light-traffic mode. **A realistic-green floor
  (`min_green_before_preemption_seconds`, 20 s main / 12 s right, gated on
  `preemption_floor_min_phase_score` = 0.12)**: a phase still serving substantial demand
  cannot be taken away by a mere score before that — the user rejected 10-15 s greens as
  unrealistic. Gap-out, max-green, starvation and emergency are NOT gated by it; the shared
  `min_green_seconds` (10/8, amber included, so 7/5 s of real green) stays the floor for
  those. The gate is the phase's own score — vehicles present, vehicles standing, and
  departure rate were all tried and all failed to separate "heavy stream being cut" from
  "four cars 150 m away" (Section 26.4b has the table). Performance metrics: travel time
  now excludes a vehicle's *scheduled* `<stop>` time (SUMO's own convention), because the
  accident scenario's worst-travel metric was the scripted 550 s stall under both
  controllers. See PROJECT_ARCHITECTURE_REPORT.md Sections 19-22 and 26.4 for why these
  exist, the A/B evidence, and the full scenario-library validation table.
- **Database** (`backend/database/db_logger.py`, SQLite, WAL mode, insert-only,
  failure-tolerant): `decision_log` (includes persisted `actual_phase`/`actual_is_yellow` —
  the TraCI-confirmed Actual State, alongside the Decision Engine's Desired State),
  `performance_log` (network-wide), `prediction_log` (predicted-vs-actual pairs),
  `lane_state_log` (per-lane, 12 rows/tick, feeds analytics). Older DB files are migrated
  in place via `ALTER TABLE` on startup, not replaced. Since 2026-09-17 every row carries
  `run_id` (the run's ISO start time; the console passes `started_at`), a new run prunes
  runs older than `Config.DB_KEEP_RUNS` (10) + `VACUUM`, and every reader (`/api/logs/*`
  with `?run=`, `/api/logs/runs`, the analytics functions' `run_id="latest"`) answers for
  ONE run (Section 30.13). Evaluations never write the DB.
- **Analytics** (`backend/analytics/congestion_analytics.py`): read-only, no FastAPI
  dependency, takes a plain `db_path`. `average_wait_times`, `congestion_trend`,
  `detect_peak_periods` — peaks are detected statistically from recorded congestion
  history, not assumed from wall-clock time-of-day (simulated time has no real hour-of-day).
- **Dashboard** (`backend/services/dashboard_server.py`): FastAPI, strictly read-only in
  itself — zero endpoints of its own that can send a command into the simulation; sourced
  from `LiveStateStore` (in-process, live) or the SQLite/CSV files the simulation already
  wrote. The WebSocket pushes a frame whenever the store's version changes (one per
  simulation tick, ≤ 30/s, 0.5 s heartbeat) — NOT on a fixed 0.5 s timer; that timer is
  what made "max" speed unrenderable (Section 30.10). A new run `clear()`s the store.
  Since 2026-09-16 the run also publishes **motion frames** every 0.2 s simulated between
  decision ticks (`snapshot_views.motion_frame`, `tick: false`): fresh vehicle positions
  only, nothing the pipeline sees — anything that samples per tick must skip
  `tick === false` (Section 30.11). The drawn kerb fillet is 11 m, deliberately 1 m
  tighter than the net polygon's 12 (`plateGeometry.KERB_R`). Vehicles carry SUMO's
  `angle` (VAR_ANGLE, dashboard-only) and both views draw from `frontend/src/data/motion.ts`
  — a frame buffer + display clock 250 ms behind the newest frame, rAF-driven, never CSS
  tweens (30.15): that is what removed the periodic hitch, so don't reintroduce
  per-frame tweening. Two hosts build the identical app: `app.py` via `start_dashboard_server()` (daemon
  thread inside the simulation process — dies with the run, which is why every page used to
  502 when SUMO closed), and `server.py` via `create_app()` in the foreground of a process
  that outlives any run. Never launched directly as a script; it has no `main()`.
- **Console** (`backend/server.py` + `backend/services/sim_supervisor.py`): the always-on
  entry point — `python server.py`, then drive everything from the browser. The supervisor
  runs one live simulation at a time on a worker thread in the console process (a thread,
  not a subprocess, because a live run publishes into the very `LiveStateStore` this server
  reads and shares its `RunControl` object with the pause endpoints — see
  PROJECT_ARCHITECTURE_REPORT.md Section 23.2). The run itself is
  `backend/simulation_runner.py`'s `run_simulation()`, extracted verbatim from `app.py`'s
  `main()` so both entry points run identical code; `app.py` is now a thin CLI wrapper over
  it and is behaviourally unchanged.
- **Run pacing** (`backend/services/run_control.py`): `RunControl` carries pause/stop AND
  speed. `pace(step_seconds)` is called once per step by `TraCIManager.run()` and sleeps to
  hold simulated time at `speed` x wall-clock time (default 1.0; `None` = unthrottled, the
  old behaviour). Required, not decorative: headless `sumo` steps at ~100x real time, which
  no live view can follow. Anchor-based rather than fixed-sleep so error cannot accumulate;
  the anchor is dropped on resume so a paused run never sprints to catch up.
- **Control layer** (`backend/services/control_routes.py`): the ONE place a web request can
  affect what's running, deliberately kept out of `dashboard_server.py` so that file's own
  "pure viewer" claim stays true. Mounted only by `app.py` and `server.py` (via
  `create_app`'s/`start_dashboard_server`'s `extra_router` param). What each host can do is
  discovered by the frontend from `GET /api/control/run-state`, never assumed:
  `POST /api/control/{pause,resume,stop,speed}` wherever a `RunControl` is attached (both
  entry points); `POST /api/control/{start-simulation,stop-simulation}` only where a
  `supervisor` was passed (`server.py` — `app.py` IS the run and cannot host a second one,
  so it reports `can_start: false` rather than offering a button that cannot work).
  Evaluator control is available from either — `POST /api/control/start-evaluator`
  `{scenario_name, baseline, gui}` launches `performance.evaluator` as a real child process
  (input validated against real scenario files / a fixed baseline whitelist before it ever
  reaches `subprocess.Popen`), `POST /api/control/stop-evaluator` stops it gracefully
  (Windows: `CTRL_BREAK_EVENT`, letting the child's own TraCI/SUMO shutdown run cleanly),
  `GET /api/control/status` self-heals when a run finishes on its own, `POST
  /api/internal/publish` is how that child's live snapshots get back into `app.py`'s
  `LiveStateStore` (it's a genuinely separate OS process — `services/live_state.py`'s
  `RemoteLiveStatePublisher`, non-blocking/threaded so a slow network call can never stall
  the simulation loop). This exists specifically so a demo needs no terminal command beyond
  `python server.py` itself — which since 2026-09-12 includes starting the live simulation.
  **Since 2026-09-14 the console runs evaluations in-process too:** `POST
  /api/control/start-evaluation {scenario_name, baseline}` hands `PerformanceEvaluator.run()`
  to the supervisor's single worker thread with the SAME `RunControl` and `LiveStateStore`
  as a demo run (Section 27) — so the top bar's pause/stop/speed drive it and no IPC
  exists. `start-simulation` gained `scenario_name`; `run-state` reports `kind`
  (`demo | evaluation | null`) and `scenario`; starting either kind while anything runs is a
  409 with a plain sentence. Scenario ids are validated in ONE place,
  `performance/scenarios.py`, by every start route. The child-process `start-evaluator`
  route still exists for terminal/`app.py` use; the console UI no longer calls it. The
  WebSocket carries one shape with `kind`: an evaluation frame has `ai` and `baseline`
  sides built by the same `services/snapshot_views.py` builders the demo uses (and no
  `prediction`). **Emergency dispatch (2026-09-18, Section 30.18):** `POST
  /api/control/dispatch {vehicle_type, approach, turn}` queues a vehicle on `RunControl`
  (still the ONE object that influences a run); the run loops drain it through
  `TrafficAdapter.add_vehicle` — the adapter's only traffic write. The evaluator adds it to
  BOTH sides and the supervisor then skips the results CSV. The evaluator now also feeds
  the AI side `get_emergency_vehicle_lanes()` (it was `frozenset()` until 2026-09-18 —
  Section 30.17).
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
- **Left turns are PROTECTED (changed 2026-09-13, at the user's request).** They used to run
  in both main phases, which the network's conflict matrix permits — all four left turns
  genuinely have an empty foe list, verified by decoding the `<request>` block. That
  permission depends on perfect lane discipline, though (every movement is channelized into
  its own dedicated outbound lane), and the user's judgement was that real traffic of the
  kind this models will not hold lane that precisely. Each left now runs only in its own
  approach's phase; verified 0 left/cross-through overlaps over two full cycles.
  `left_turn_influence` in `DecisionConfig` is now dead and documented as such. See
  PROJECT_ARCHITECTURE_REPORT.md Section 25. **Both consequences were closed on
  2026-09-13 (Section 26):** all 38 training runs were regenerated under the new program,
  the model retrained, and the 13-scenario VAC sweep re-run — the numbers in README.md are
  current again. Doing that surfaced two things that had been wrong since long before the
  program change, both now fixed: the model predicted absolute levels (worse than plain
  persistence on vehicle counts), and its #1 feature `seconds_until_next_signal_switch` was
  a train/serve deviation (a real countdown in training data, a re-armed 60 s ceiling at
  run time). The model now predicts RESIDUALS (`target_mode` in its metadata — a model
  without metadata is read as absolute), the feature is `seconds_in_current_phase` (a phase
  clock the adapter keeps), and confidence in residual mode is spread-only. If you ever
  touch `SignalController`'s provisional hold or the feature vector, re-read Section 26.2
  first — that is exactly the kind of change that silently skews the model.
- **Multi-junction coordination is out of scope, permanently** (the user has decided
  against ever pursuing it, not merely deferred it). `feature_schema.py`,
  `traffic_adapter.py`, `scenario_manifest.py`, and `decision_engine.py` all independently
  hardcode the single-junction ("C") assumption. Confirmed to be a genuine cross-cutting
  redesign, not a bolt-on — the user has decided not to pursue it.
- **Frontend: sixth attempt in progress, built iteratively from an approved layout.** Five
  directions were rejected (a vanilla-JS dashboard, a first React rebuild, a neon-glow HUD, a
  restrained Stripe/Linear/Vercel version, a literal "drafting sheet" system) and `frontend/`
  was emptied on 2026-09-08. On 2026-09-11 the user supplied a Stitch (Google) export whose
  **layout** they approved (colours not) and the palette has since been iterated to the
  user's own choices: red rail, traffic-yellow ground (`#F4B31D`), pale-green cards, real
  signal-colour lamps, Orbitron/Barlow/JetBrains Mono. Overview, Analytics, Performance
  (two live junctions + seven metric verdicts) and Simulation Settings (scenario cards) are
  built; **Decisions was built 2026-09-17** (Section 30.14) as the brief's §8.4 audit
  trail over the run-scoped database — the only page that reads the DB. Overview gained
  the §7.5 score ledger ("Why this phase", `decision.margin` is the engine's effective
  hysteresis margin) and "Recent switches" (30.12). `decision_log` rows now store
  `phase_scores`, `margin` and `scenario` for it. No placeholder pages remain. Lane ids
  (`N_in_0`) no longer render anywhere — every lane is "North · Left"
  (`utils/signal.laneLabel`). The design contract is
  `docs/design/TRINETRA_UI_DESIGN_BRIEF.md` (its reference-kit process was dropped by the
  user; its data rules, banned-defaults list and page plan still apply). Two standing rules
  from the user: **never show prediction confidence anywhere in the UI**, and do NOT
  reintroduce neon/glassmorphism (a Gemini prompt proposing exactly that was reviewed and
  rejected on 2026-09-11 — it also assumed a Flask/Socket.IO backend that doesn't exist).
  A 3D miniature of the junction DOES exist now, at the user's explicit request
  (`overview/Junction3D.tsx`) — three.js, true network scale, sumo-gui's own look; that is
  not the rejected neon "3D cyberpunk" direction. Since 2026-09-14 the plan view is ALSO
  true scale (`overview/plateGeometry.ts` is in metres, transcribed from the net file;
  vehicles at their vType length × width; sumo-gui-style zoom with 1× = whole network) —
  the user asked for it after the schematic's exaggerated lane widths made heavy traffic
  look light. Keep the drafting look; do not go back to a schematic scale (Section 28.5).
  Since 2026-09-15 (Section 30): the wheel zooms only with Ctrl/⌘ held (a plain wheel
  scrolls the page — the user's call; nothing printed on the map about it), the plate
  opens at 3.5×, the two Performance windows zoom independently with a one-shot Match
  button (the shared frame of 28.5 was overruled), Settings is ONE scenario grid with a
  "Choose for" dropdown, and the production-route card is gone (Balanced is the demo
  default; the backend's `default` id still works, it just has no card). **The top bar
  is per page** (`data/pageContext.ts`): Performance's bar drives the evaluation,
  Overview/Analytics' the demo, Settings' whichever its dropdown names (and navigates
  there); when the other kind is running, Start ends it first
  (`runState.replaceWith*`). Performance idle is the full dark layout, never a
  placeholder card (Section 30.6–30.7).
  **Motion has one vocabulary (2026-09-15, Section 29):** `src/ui/motion.ts` plus the
  `--dur-*`/`--ease-*` tokens, spent on the signal release (the arrow sweep and lamp bloom
  on a confirmed green, triggered by the derived `utils/signal.phaseKey`), data tweens,
  pointer answers, and a once-per-page arrival. The design brief's blanket motion ban was
  lifted BY THE USER and the brief amended to match - read its status header before
  treating any of it as binding, because several parts are superseded by his later
  choices. Still banned: looping in the periphery, glow pulses, and depending on an
  animation finishing for correctness. Analytics reads the LIVE stream only, by
  explicit instruction — see PROJECT_ARCHITECTURE_REPORT.md Section 23.4 before pointing it
  back at the database. See `frontend/README.md` for what's verified vs. still open (logo
  asset lost, no visual verification in the build environment).
- No ESP32/physical hardware integration exists (the `firmware/` directory is empty) —
  the project is SUMO-simulation-only.
- Database has 4 tables (see above), not the guide's originally-envisioned 8.

## Working with this project

- **UI work: change how it looks, never how much it says.** `docs/UI_CHANGE_RULES.md` is
  binding for any interface change (recolouring, repositioning, new panels, new pages are
  all free; removing any item of its content inventory needs the owner's explicit written
  instruction naming the item — an item lost as a side effect of a redesign is a defect).
  Read it at the start of any UI task and tick its inventory afterwards. `prototype-1`
  (commit d9afd01, 2026-09-17) is the tagged state it describes.
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
