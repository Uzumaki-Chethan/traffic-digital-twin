# Performance page, Simulation Settings, and vehicle rendering — design

Date: 2026-09-14. Approved section by section in conversation; this is the
written form.

## Goal

Two new pages in the console, plus rendering fixes the new page would
otherwise inherit:

1. **Performance** — watch Trinetra (the AI) and Vehicle-Actuated Control
   (VAC) handle the *identical* scenario side by side, live, with a graph
   and a running verdict for each of the seven evaluation metrics.
2. **Simulation Settings** — pick which scenario the Overview demo and the
   Performance evaluation run, from cards with plain-language descriptions.
3. **Vehicle rendering** — plan-view vehicles no longer overlap in a queue;
   3D motorcycles and auto-rickshaws have real silhouettes; plate labels use
   plain words instead of SUMO lane ids.

Decisions already taken (do not reopen): two live junction plates (plan view
only) on Performance; the same Pause/Play/Stop/speed bar as Overview;
time-series + running verdict per metric; 13 scenario cards, seed 1 fixed;
one run at a time; the evaluation runs **in-process** on the supervisor's
worker thread (approach A).

## Non-goals

- Running a demo and an evaluation at the same time.
- Seed selection in the UI.
- Fixed-timer baseline in the UI (the API accepts `baseline`; the UI sends `vac`).
- Any view of prediction confidence (standing rule).
- 3D on the Performance page.
- sumo-gui / window handover for evaluations.

## 1. Backend contract

### run-state

`GET /api/control/run-state` adds:

| field | values | meaning |
|---|---|---|
| `kind` | `"demo"`, `"evaluation"`, `null` | what the worker is running |
| `scenario` | scenario id, `"default"`, or `null` | e.g. `"extreme_seed1"` |

All existing fields keep their meaning for either kind.

### Starting

- `POST /api/control/start-simulation` — body gains optional
  `scenario_name` (a `*_seedN` id). Omitted → the production route
  (`sumo/config/intersection.sumocfg`), reported as `"default"`.
- `POST /api/control/start-evaluation` — body `{scenario_name, baseline}`;
  `baseline` ∈ {`vac`, `fixed_timer`}, UI sends `vac`. Headless always.
- Both validate `scenario_name` with the same function (`known_scenario_names()`
  in a shared module) that `start-evaluator` uses today.
- Either start while anything runs → `409` with a plain sentence:
  `"A demo run is active — stop it first."` / `"An evaluation is active — stop it first."`
- `pause`, `resume`, `stop`, `speed`, `open-window` (handover) unchanged;
  `run-state` reports handover as unavailable for an evaluation.
- The child-process `start-evaluator` / `stop-evaluator` routes stay for
  terminal / `app.py` use; the console UI no longer calls them.

### Snapshot (one WebSocket, one shape)

```
kind: "demo"        → exactly today's LiveSnapshot, plus kind
kind: "evaluation"  → {
  kind, sim_time, scenario, baseline,
  ai:       { signal, metrics, lanes, vehicles, decision, phase_history },
  baseline: { signal, metrics, lanes, vehicles, decision, phase_history },
  comparison: { rows: [7 × {key, label, ai, baseline, improvement}], final: bool }
}
```

Both sides use the same view builders the demo uses, moved into
`backend/services/snapshot_views.py`. `prediction` is not in the evaluation
payload. Publish cadence: 2 Hz of simulated time, paced by `RunControl`.
`comparison.final` is `true` on the last publish only.

## 2. Evaluation under the supervisor

- `SimSupervisor.start(gui=False, scenario_name=None)` and
  `SimSupervisor.start_evaluation(scenario_name, baseline="vac")` share the
  single worker slot, `RunControl`, and `LiveStateStore`. The supervisor
  records `kind`/`scenario`, clears them when the worker ends, and reports
  crashes as `error` for either kind.
- `PerformanceEvaluator.run(live_store=None, control=None)`: with `control`,
  each lockstep iteration calls `control.wait_if_paused()`, breaks on
  `control.stop_requested`, and `control.pace(step_seconds)` after stepping
  both simulations. Without `control` the batch behaviour is unchanged.
- The CSV is still written at the end of a browser-started evaluation.
- `resolve_config(gui=None, base=Config, load_state=None, sumocfg=None)` —
  `sumocfg` overrides `SUMOCFG_PATH` on the throwaway subclass.
- Scenario id → path lives in one place (`backend/performance/scenarios.py`),
  used by both start routes and the evaluator.

## 3. Frontend

### Navigation

Rail: Overview, Analytics, Performance, Decisions, **Simulation Settings**.

### Simulation Settings (`/settings`)

Two sections of identical card grids:

- **Overview · demo**: "Everyday junction traffic" (production route; 480 veh/h
  per approach, mixed vehicles, 10 minutes; pre-selected) + 13 scenarios.
- **Performance · Trinetra vs VAC**: the 13 scenarios.

Card: plain-language name, one-line description, demand cue
(light / moderate / heavy / ramping). Descriptions live in one frontend
table (`data/scenarios.ts`) keyed by scenario id; the id itself never
renders. Selection stored in `localStorage`
(`trinetra.settings.demoScenario`, `trinetra.settings.evalScenario`).
While a run of that kind is active the section says "stop the current run
to change" and cards are inert.

### Overview

Start sends the demo selection. A chip beside the page title shows the
selected scenario and links to Settings. On `kind: "evaluation"` the twin
card shows "An evaluation is running — watch it on Performance" with a link.

### Performance (`/performance`)

- Header: scenario chip, "vs Vehicle-Actuated Control", link to Settings.
  Run controls are the shared top bar.
- Two side-by-side windows — **Trinetra** and **Vehicle-actuated control** —
  each a `JunctionPlate` fed from `snapshot.ai` / `snapshot.baseline`, with a
  header row: active phase (plain words), vehicles on approaches, mean wait.
- Seven metric blocks (CSV order): two-line time series (Trinetra green,
  VAC brown), both current values, verdict badge — *Trinetra ahead N %* /
  *Even* (|improvement| < 0.5 %) / *VAC ahead N %*; "so far" while running,
  "final" once `comparison.final`, plus a summary line "Trinetra ahead on
  k of 7". Throughput carries the note "tied by construction — both
  controllers serve the same vehicles".
- `data/evalHistory.ts`: one sample per evaluation tick (sim_time + both
  sides' seven metrics), once-a-second revision gate, ~1 h capacity.
- No evaluation running → both windows show a start prompt with the selected
  scenario and Start.
- On `kind: "demo"` the page mirrors Overview's message.

Palette, fonts, and the two standing rules (no confidence, no internal
jargon) unchanged.

## 4. Vehicle rendering

- **Plate lengths at true scale**: length = SUMO length × 2.3 units/m
  (car 10.4, motorcycle 4.6, auto 6.0, bus 24.2, truck 18.4). Widths keep
  today's exaggeration. Queues then draw at SUMO's own spacing.
- **3D silhouettes**: motorcycle = narrow frame, two wheels, rider block;
  auto-rickshaw = three wheels, short tall cab, canopy; cars/bus/truck as
  today. True SUMO dimensions, vType colours, shared cached geometries.
- **Plate labels**: "North · Left" etc., N/S labels stacked vertically.
  Lane tables show the same wording in one column; `N_in_0`-style ids leave
  the UI.

## 5. Tests and verification

- Offline tests: supervisor kind/scenario/409; `resolve_config(sumocfg=)`;
  evaluator loop pause/stop/pace with fake managers; two-sided snapshot
  builder equals the demo builder per side; shared scenario validation.
- Frontend: `tsc -b`, lint, build clean; Vitest added for `evalHistory` and
  the verdict rule only.
- End to end (Playwright, once): Settings → Extreme for Performance → Start →
  both plates animate, blocks fill, Pause freezes both, 5× is faster, Stop →
  verdicts lock and `results/comparison_extreme_seed1.csv` exists; Settings →
  Rush hour for Overview → Overview Start runs it. Screenshots: a stopped
  queue on the plate; each 3D vehicle type close up.
- Docs: README, CLAUDE.md, architecture report Section 27, frontend/README,
  ONBOARDING page list.
