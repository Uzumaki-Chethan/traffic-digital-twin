# Performance Page + Simulation Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live side-by-side Trinetra-vs-VAC Performance page with per-metric graphs and verdicts, a Simulation Settings page that picks the scenario for both the demo and the evaluation, and corrected vehicle rendering (true-scale plate lengths, real 3D motorcycle/auto-rickshaw silhouettes, plain-language plate labels).

**Architecture:** The evaluation runs in-process on the console supervisor's single worker thread (same `RunControl`, same `LiveStateStore` as the demo), so pause/speed/stop are the same bar. One WebSocket snapshot shape gains `kind: "demo" | "evaluation"`; the evaluation payload carries both sides' junction state built by the same view builders the demo uses. Scenario selection lives in the frontend (`localStorage`) and travels in the start request; validation and id→path mapping live in one backend module used by every start route.

**Tech Stack:** Python 3.13 / FastAPI / SUMO-TraCI backend; React 19 + TypeScript + Vite + Tailwind v4 + zustand frontend; custom SVG charts (as Analytics); three.js for 3D; pytest; Vitest (new, two modules only).

**Spec:** `docs/superpowers/specs/2026-09-14-performance-and-settings-design.md`

## Global Constraints

- Architecture rule (CLAUDE.md): `TrafficAdapter` is the only module touching `traci`; `dashboard_server.py` stays read-only; control lives in `control_routes.py`; modules write only the state they own.
- One run at a time: starting either kind while anything runs → HTTP 409 with `"A demo run is active — stop it first."` / `"An evaluation is active — stop it first."`
- Snapshot: `kind: "demo"` = today's `LiveSnapshot` + `kind`; `kind: "evaluation"` = `{kind, sim_time, scenario, baseline, ai:{signal,metrics,lanes,vehicles,decision,phase_history}, baseline:{…same…}, comparison:{rows, final}}`. No `prediction` in evaluation snapshots.
- Evaluation publishes once per decision tick (1 s simulated), paced by `RunControl`; `comparison.final = true` only on the last publish.
- UI standing rules: **never show prediction confidence**; **no internal jargon** — scenario ids (`extreme_seed1`) and lane ids (`N_in_0`) never render; palette/fonts unchanged (red rail, `#F4B31D` ground, pale-green cards, Orbitron/Barlow/JetBrains Mono).
- Verdict rule: `|improvement| < 0.5` → "Even"; `improvement > 0` → "Trinetra ahead N %"; else "VAC ahead N %".
- Plate vehicle length = SUMO length × 2.3 units/m (car 10.4, motorcycle 4.6, auto 6.0, bus 24.2, truck 18.4); widths unchanged.
- Run backend commands from `backend/`; frontend commands from `frontend/`. Tests: `python -m pytest ../tests/ -q` (65 passing at start), `npx tsc -b && npm run lint && npm run build`.
- Commit after every task; end every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File map

Backend (create): `backend/performance/scenarios.py`, `backend/services/snapshot_views.py`, `tests/test_scenarios.py`, `tests/test_snapshot_views.py`, `tests/test_evaluation_gate.py`.
Backend (modify): `backend/simulation_runner.py` (resolve_config sumocfg; use snapshot_views; `kind`), `backend/performance/evaluator.py` (control + two-sided publish), `backend/services/sim_supervisor.py` (kind/scenario/start_evaluation), `backend/services/control_routes.py` (scenario_name, start-evaluation, run-state, open-gui guard), `tests/test_run_control.py` (supervisor cases).
Frontend (create): `src/data/scenarios.ts`, `src/data/settings.ts`, `src/data/evalHistory.ts`, `src/data/verdict.ts`, `src/pages/SettingsPage.tsx`, `src/settings/ScenarioCard.tsx`, `src/pages/PerformancePage.tsx`, `src/performance/ControllerWindow.tsx`, `src/performance/MetricBlock.tsx`, `src/performance/EvalStartPrompt.tsx`, `src/data/__tests__/evalHistory.test.ts`, `src/data/__tests__/verdict.test.ts`, `vitest.config.ts`.
Frontend (modify): `src/data/types.ts`, `src/data/runState.ts`, `src/data/useSocket.ts`, `src/data/liveHistory.ts` (ignore evaluation frames), `src/App.tsx`, `src/layout/NavRail.tsx`, `src/layout/RunControls.tsx`, `src/pages/OverviewPage.tsx`, `src/overview/TwinViewport.tsx` (`allow3d`), `src/overview/vehicleTypes.ts`, `src/overview/Junction3D.tsx`, `src/overview/plateGeometry.ts`, `src/overview/JunctionPlate.tsx`, `src/overview/LaneTable.tsx`, `src/analytics/LaneLedger.tsx`, `package.json`.
Docs: `README.md`, `CLAUDE.md`, `PROJECT_ARCHITECTURE_REPORT.md` (Section 27), `frontend/README.md`, `docs/ONBOARDING.md`.

---

### Task 1: Scenario registry (backend)

**Files:**
- Create: `backend/performance/scenarios.py`
- Modify: `backend/services/control_routes.py` (replace `_known_scenario_names` + `_SCENARIO_DIR` with imports)
- Test: `tests/test_scenarios.py`

**Interfaces:**
- Produces: `DEFAULT_SCENARIO = "default"`; `known_scenario_names() -> set[str]` (ids of every `sumo/config/scenarios/*.sumocfg`, no extension); `scenario_sumocfg_path(name: str) -> str` (absolute path; `"default"` → `Config.SUMOCFG_PATH`; unknown → `ValueError("Unknown scenario 'x'")`); `is_known_scenario(name) -> bool` (`"default"` counts).

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_scenarios.py
import os, sys
from pathlib import Path
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
import pytest
from config import Config
from performance.scenarios import (
    DEFAULT_SCENARIO, is_known_scenario, known_scenario_names, scenario_sumocfg_path,
)

def test_known_names_are_the_sumocfg_basenames():
    names = known_scenario_names()
    assert "light_seed1" in names and "extreme_seed2" in names
    assert all(not n.endswith(".sumocfg") for n in names)

def test_default_maps_to_the_production_route():
    assert scenario_sumocfg_path(DEFAULT_SCENARIO) == Config.SUMOCFG_PATH
    assert is_known_scenario(DEFAULT_SCENARIO)

def test_named_scenario_maps_to_its_file():
    p = scenario_sumocfg_path("light_seed1")
    assert p.endswith(os.path.join("scenarios", "light_seed1.sumocfg")) and os.path.isfile(p)

def test_unknown_scenario_is_rejected():
    assert not is_known_scenario("../../evil")
    with pytest.raises(ValueError):
        scenario_sumocfg_path("../../evil")
```

- [ ] **Step 2: Run to verify it fails** — `cd backend && python -m pytest ../tests/test_scenarios.py -q` → ImportError.

- [ ] **Step 3: Implement**

```python
# backend/performance/scenarios.py
"""
The one place a scenario id becomes a file path. Both start routes
(demo and evaluation) validate against known_scenario_names() before a
name reaches SUMO, and the evaluator resolves its path here too.
"""
import glob, os
from config import Config

DEFAULT_SCENARIO = "default"
SCENARIO_DIR = os.path.join(Config.PROJECT_ROOT, "sumo", "config", "scenarios")

def known_scenario_names() -> set:
    return {os.path.splitext(os.path.basename(p))[0]
            for p in glob.glob(os.path.join(SCENARIO_DIR, "*.sumocfg"))}

def is_known_scenario(name: str) -> bool:
    return name == DEFAULT_SCENARIO or name in known_scenario_names()

def scenario_sumocfg_path(name: str) -> str:
    if name == DEFAULT_SCENARIO:
        return Config.SUMOCFG_PATH
    if name not in known_scenario_names():
        raise ValueError("Unknown scenario {!r}".format(name))
    return os.path.join(SCENARIO_DIR, "{}.sumocfg".format(name))
```

In `control_routes.py`: delete `_SCENARIO_DIR` and `_known_scenario_names`; `from performance.scenarios import known_scenario_names, is_known_scenario`; replace the call in `start_evaluator`.

- [ ] **Step 4: Run all tests** — `python -m pytest ../tests/ -q` → 69 passed.
- [ ] **Step 5: Commit** — `feat(backend): one scenario registry for every start route`.

---

### Task 2: `resolve_config(sumocfg=)` and `run_simulation(sumocfg=)`

**Files:**
- Modify: `backend/simulation_runner.py` (`resolve_config`, `run_simulation` signature — pass `sumocfg` through to `resolve_config`)
- Test: `tests/test_run_control.py` (append)

**Interfaces:**
- Produces: `resolve_config(gui=None, base=Config, load_state=None, sumocfg=None)`; `run_simulation(store, control=None, *, gui=None, base_config=Config, load_state=None, sumocfg=None)`.

- [ ] **Step 1: Failing tests**

```python
def test_resolve_config_sumocfg_override_is_a_throwaway_subclass():
    from config import Config
    from simulation_runner import resolve_config
    cfg = resolve_config(sumocfg="/tmp/x.sumocfg")
    assert cfg.SUMOCFG_PATH == "/tmp/x.sumocfg"
    assert cfg is not Config and issubclass(cfg, Config)
    assert Config.SUMOCFG_PATH != "/tmp/x.sumocfg"

def test_resolve_config_without_overrides_is_config_itself():
    from config import Config
    from simulation_runner import resolve_config
    assert resolve_config() is Config
```

- [ ] **Step 2: Run** → AttributeError / TypeError.
- [ ] **Step 3: Implement** — in `resolve_config`: change the early return to `if gui is None and load_state is None and sumocfg is None: return base`; add `if sumocfg: overrides["SUMOCFG_PATH"] = sumocfg` before building the subclass. In `run_simulation`: add `sumocfg=None` kwarg, pass to `resolve_config(gui=gui, base=base_config, load_state=load_state, sumocfg=sumocfg)`.
- [ ] **Step 4: Run all tests** → pass.
- [ ] **Step 5: Commit** — `feat(backend): resolve_config accepts a scenario sumocfg`.

---

### Task 3: Shared snapshot view builders

**Files:**
- Create: `backend/services/snapshot_views.py`
- Modify: `backend/simulation_runner.py` (use the builders; add `"kind": "demo"`)
- Test: `tests/test_snapshot_views.py`

**Interfaces:**
- Produces (pure functions, no traci):
  - `signal_view(state) -> dict` — moved from `simulation_runner._signal_view` unchanged (`{phase, is_yellow, green, countdown}`).
  - `lanes_view(features, lane_scores: dict, lane_states: dict) -> list[dict]` — 12 entries `{lane_id, vehicles, avg_wait, score, signal}` in `ALL_APPROACH_LANES` order.
  - `vehicles_view(state) -> list[dict]` — `{id, lane, x, y, speed, type}` per `VehicleState`.
  - `metrics_view(features) -> dict` — `{vehicles, avg_speed, avg_wait, queue, stopped}`.
  - `decision_view(decision) -> dict` — `{active_phase, mode, switched, reason, duration, phase_scores}`.
  - `side_view(state, features, decision, lane_states, phase_history) -> dict` — `{signal, metrics, lanes, vehicles, decision, phase_history}` (what an evaluation side carries).

- [ ] **Step 1: Failing tests** — build a `SimulationState` with two `VehicleState`s and a `SignalState` (phase index 0), a `TrafficFeatures` with one lane, and a `Decision`-like object (`types.SimpleNamespace(active_phase="NS_straight_left", decision_mode="priority", switched=False, reason_text="x", green_duration_seconds=3.0, phase_scores={}, lane_scores={"N_in_0": 0.42})`). Assert: `signal_view` gives `phase == "NS_straight_left"`, `is_yellow False`; `lanes_view` has 12 rows with `N_in_0.score == 0.42` and absent lanes `vehicles == 0`; `vehicles_view` rounds x/y to 2 dp and carries `type`; `side_view` keys exactly `{"signal","metrics","lanes","vehicles","decision","phase_history"}`.
- [ ] **Step 2: Run** → ImportError.
- [ ] **Step 3: Implement** — move `_signal_view` and the two list comprehensions from `simulation_runner.py:395-450` into the module verbatim (names as above); `simulation_runner.py` imports them and its `store.publish({...})` becomes `store.publish({"kind": "demo", "sim_time": ..., "signal": signal_view(state), "metrics": metrics_view(features), "lanes": lanes_view(features, decision.lane_scores, lane_states), "vehicles": vehicles_view(state), "decision": decision_view(decision), "emergency_lanes": ..., "prediction": latest_evaluated, "comparison": None, "phase_history": list(phase_history)})`. The `lane_state_log` DB rows keep their own comprehension (different fields).
- [ ] **Step 4: Run all tests**; then a 30-second real check: `python -c` that imports `simulation_runner` (import only — SUMO runs are checked in Task 13).
- [ ] **Step 5: Commit** — `refactor(backend): one set of snapshot view builders for demo and evaluation`.

---

### Task 4: Evaluator — RunControl gate and two-sided live payload

**Files:**
- Modify: `backend/performance/evaluator.py`
- Test: `tests/test_evaluation_gate.py`

**Interfaces:**
- Consumes: `services.run_control.RunControl` (`wait_if_paused()`, `stop_requested`, `pace(step_seconds)`), `services.snapshot_views.side_view`, `performance.scenarios.scenario_sumocfg_path`.
- Produces: `PerformanceEvaluator(scenario_name, use_gui=False, baseline="fixed_timer", decision_config=None)` unchanged; `run(live_store=None, control=None) -> dict`; module-level `lockstep_gate(control, step_seconds) -> bool` (returns False when the loop must stop); `evaluation_snapshot(scenario, baseline, sim_time, ai_side, base_side, rows, final) -> dict`.

- [ ] **Step 1: Failing tests**

```python
# tests/test_evaluation_gate.py
from services.run_control import RunControl
from performance.evaluator import lockstep_gate, evaluation_snapshot

def test_gate_stops_when_stop_requested():
    c = RunControl(); c.request_stop()
    assert lockstep_gate(c, 0.05) is False

def test_gate_continues_and_paces_when_running():
    c = RunControl(speed=None)  # unthrottled: pace returns immediately
    assert lockstep_gate(c, 0.05) is True

def test_gate_without_control_is_a_noop():
    assert lockstep_gate(None, 0.05) is True

def test_evaluation_snapshot_shape():
    side = {"signal": None, "metrics": {}, "lanes": [], "vehicles": [], "decision": {}, "phase_history": []}
    snap = evaluation_snapshot("light_seed1", "vac", 12.0, side, side, [{"key": "k"}], final=False)
    assert snap["kind"] == "evaluation" and snap["scenario"] == "light_seed1"
    assert set(snap) == {"kind", "sim_time", "scenario", "baseline", "ai", "baseline", "comparison"} - set() | {"kind"}
    assert snap["comparison"] == {"rows": [{"key": "k"}], "final": False}
    assert "prediction" not in snap
```

(The `set(snap)` line: assert `set(snap) == {"kind","sim_time","scenario","baseline","ai","comparison"}` — note `baseline` is both the controller name and… no: name the side key `vac_side`? **Decision:** payload keys are `ai` and `baseline` for the two sides, and the controller name is `baseline_controller` — matching today's `ComparisonView.baseline_controller`. So: `set(snap) == {"kind","sim_time","scenario","baseline_controller","ai","baseline","comparison"}`.)

- [ ] **Step 2: Run** → ImportError.
- [ ] **Step 3: Implement**
  - `lockstep_gate`: `if control is None: return True; control.wait_if_paused(); if control.stop_requested: return False; return True` — and pacing is applied *after* stepping, so add a second helper `pace_after_step(control, step_seconds)`: `if control is not None: control.pace(step_seconds)`. Read the step length once: `step_seconds = conn_ai.simulation.getDeltaT()` after `manager_ai.start()`.
  - `evaluation_snapshot(...)` returns the dict in the Global Constraints shape with `baseline_controller`.
  - In `run()`: accept `control=None`; `self._sumocfg_path` may come from `scenario_sumocfg_path` (keep the existing `SCENARIO_DIR` join — but use `scenario_sumocfg_path(scenario_name)` so `"default"` also works). At the top of the `while True:` add `if not lockstep_gate(control, step_seconds): break`; after both `simulationStep()`s add `pace_after_step(control, step_seconds)`.
  - Publishing: keep `state_ai`/`state_base`, the latest `decision`/`decision_base`, `lane_states` from each adapter (`state.signal.lane_states`), per-side `phase_history` deques (60 entries like the runner), and publish once per AI decision tick (inside the `if is_first_tick or elapsed >= …` block, after the decision) using `side_view(...)` for both sides and `self._comparison_rows(ai_mid, base_mid)`; `final=False`. In the `finally`, after summaries, if `live_store is not None` publish once more with the final rows and `final=True`. For `fixed_timer` baseline (no decision object) pass `decision_view` of a synthetic `SimpleNamespace(active_phase=<phase name from signal index>, decision_mode="fixed_timer", switched=False, reason_text="Fixed-time program.", green_duration_seconds=0.0, phase_scores={})`.
  - Remove the old `live_store.publish({... "comparison": ...})` block (replaced).
- [ ] **Step 4: Run all tests** → pass. Then a real 2-minute check that batch mode is untouched: `python -m performance.evaluator --scenario light_seed1 --baseline vac` still prints the table and writes the CSV (values identical to `results/comparison_light_seed1.csv` — determinism check).
- [ ] **Step 5: Commit** — `feat(evaluator): RunControl pacing/pause/stop and a two-sided live snapshot`.

---

### Task 5: Supervisor — kind, scenario, `start_evaluation`

**Files:**
- Modify: `backend/services/sim_supervisor.py`
- Test: `tests/test_run_control.py` (append to the existing supervisor tests; they construct `SimulationSupervisor(store, runner=fake)`)

**Interfaces:**
- Produces: `SimulationSupervisor(store, runner=None, evaluation_runner=None)`; `start(gui=False, scenario_name=None) -> dict`; `start_evaluation(scenario_name, baseline="vac") -> dict`; `status_dict()` adds `"kind": "demo"|"evaluation"|None`, `"scenario": str|None`; `open_gui()` raises `RuntimeError("Only a demo run can be opened in a SUMO window.")` when kind is evaluation. `RuntimeError` messages for a second start: `"A demo run is active — stop it first."` / `"An evaluation is active — stop it first."`.
- The injected `evaluation_runner(store, control, scenario_name, baseline)` is called on the worker thread; the real one (imported lazily) is `lambda store, control, scenario_name, baseline: PerformanceEvaluator(scenario_name, use_gui=False, baseline=baseline).run(live_store=store, control=control)` followed by `PerformanceEvaluator.save_csv(result)`.

- [ ] **Step 1: Failing tests**

```python
def test_supervisor_reports_kind_and_scenario_for_a_demo(store):
    sup = SimulationSupervisor(store, runner=_blocking_runner)  # existing helper that waits on an Event
    sup.start(gui=False, scenario_name="light_seed1")
    s = sup.status_dict()
    assert s["kind"] == "demo" and s["scenario"] == "light_seed1"

def test_supervisor_default_scenario_when_none_given(store):
    sup = SimulationSupervisor(store, runner=_blocking_runner)
    sup.start()
    assert sup.status_dict()["scenario"] == "default"

def test_start_evaluation_runs_the_evaluation_runner_with_control(store):
    seen = {}
    def fake_eval(st, control, scenario_name, baseline):
        seen.update(scenario=scenario_name, baseline=baseline, control=control)
    sup = SimulationSupervisor(store, evaluation_runner=fake_eval)
    sup.start_evaluation("heavy_seed1", baseline="vac"); sup.join(2)
    assert seen == {"scenario": "heavy_seed1", "baseline": "vac", "control": sup.run_control}
    assert sup.status_dict()["kind"] is None  # cleared when the worker ends

def test_second_start_of_either_kind_is_refused_with_the_right_sentence(store):
    sup = SimulationSupervisor(store, runner=_blocking_runner, evaluation_runner=_blocking_runner4)
    sup.start()
    with pytest.raises(RuntimeError, match="A demo run is active"):
        sup.start_evaluation("light_seed1")
    _release(); sup.join(2)
    sup.start_evaluation("light_seed1")
    with pytest.raises(RuntimeError, match="An evaluation is active"):
        sup.start()

def test_open_gui_is_refused_for_an_evaluation(store):
    sup = SimulationSupervisor(store, evaluation_runner=_blocking_runner4)
    sup.start_evaluation("light_seed1")
    with pytest.raises(RuntimeError, match="Only a demo run"):
        sup.open_gui()
```

(Read the existing fixtures in `tests/test_run_control.py` first and reuse its blocking-runner helper; `_blocking_runner4` is the same idea with the 4-arg signature.)

- [ ] **Step 2: Run** → TypeError/AssertionError.
- [ ] **Step 3: Implement** — add `self._kind = None; self._scenario = None; self._evaluation_runner = evaluation_runner`; `status_dict` adds `"kind": self._kind if running else None` (keep `scenario` of the last run for the UI: `"scenario": self._scenario`); `start()` refuses with the kind-specific sentence, sets `_kind="demo"`, `_scenario = scenario_name or DEFAULT_SCENARIO`, passes `sumocfg` to the runner (`runner(self._store, self.run_control, gui=gui, load_state=load_state, sumocfg=path)` where `path = scenario_sumocfg_path(self._scenario)` — the real runner accepts `sumocfg` from Task 2; the fake runners in tests must accept `**kwargs`); `start_evaluation()` mirrors `start()` with a thread target `_run_evaluation(scenario_name, baseline)` that calls the (lazily imported) evaluation runner inside the same try/except/finally pattern, no handover loop; `open_gui()` checks `self._kind == "evaluation"` first. Import `DEFAULT_SCENARIO`/`scenario_sumocfg_path` at module top (they don't pull SUMO in).
- [ ] **Step 4: Run all tests** → pass.
- [ ] **Step 5: Commit** — `feat(supervisor): evaluation runs on the same worker slot; kind and scenario in status`.

---

### Task 6: Control routes — scenario in start, `start-evaluation`, run-state

**Files:**
- Modify: `backend/services/control_routes.py`
- Test: `tests/test_control_routes.py` (create; uses `fastapi.testclient.TestClient` — `httpx` is a FastAPI test dependency; if `import httpx` fails, `pip install httpx` and add `httpx>=0.27` to `requirements.txt`)

**Interfaces:**
- `StartSimulationRequest.scenario_name: Optional[str] = None`; `StartEvaluationRequest(scenario_name: str, baseline: str = "vac")`.
- `POST /api/control/start-simulation` → 400 `"Unknown scenario_name 'x'."` on bad id; 409 on supervisor `RuntimeError`.
- `POST /api/control/start-evaluation` → same validation; 409 when `supervisor is None` (`"This dashboard cannot start an evaluation."`); `baseline` must be in `("vac", "fixed_timer")`.
- `run-state` passes the supervisor dict through unchanged (it now carries `kind`/`scenario`).

- [ ] **Step 1: Failing tests** — build `create_app`-free: `app = FastAPI(); app.include_router(build_control_router(LiveStateStore(), run_control=sup.run_control, supervisor=sup))` with a fake-runner supervisor. Assert: bad scenario → 400; `start-simulation {"scenario_name": "light_seed1"}` → 200 and `run-state` has `kind == "demo"`, `scenario == "light_seed1"`; `start-evaluation` while running → 409 with the demo sentence; after stop+join, `start-evaluation {"scenario_name":"light_seed1"}` → 200 with `kind == "evaluation"`; `open-gui` then → 409.
- [ ] **Step 2: Run** → 422/AttributeError.
- [ ] **Step 3: Implement** the models and routes as specified; validation via `is_known_scenario`.
- [ ] **Step 4: Run all tests** → pass.
- [ ] **Step 5: Commit** — `feat(control): scenario selection for demo runs; start-evaluation endpoint`.

---

### Task 7: Frontend types, scenarios table, settings store

**Files:**
- Modify: `frontend/src/data/types.ts`, `frontend/src/data/runState.ts`, `frontend/src/data/liveHistory.ts`, `frontend/src/data/useSocket.ts`
- Create: `frontend/src/data/scenarios.ts`, `frontend/src/data/settings.ts`

**Interfaces:**
- `types.ts`: `LiveSnapshot.kind?: 'demo'`; new `SideView { signal: SignalView|null; metrics: MetricsView; lanes: LaneView[]; vehicles: VehicleView[]; decision: DecisionView; phase_history: PhaseHistoryEntry[] }`; `EvaluationSnapshot { kind: 'evaluation'; sim_time: number; scenario: string; baseline_controller: string; ai: SideView; baseline: SideView; comparison: { rows: ComparisonRow[]; final: boolean } }`; `Snapshot = LiveSnapshot | EvaluationSnapshot | WaitingSnapshot`; guards `isEvaluation(s)`, and `isLive(s)` narrowed to `'sim_time' in s && s.kind !== 'evaluation'`.
- `runState.ts`: `RunState.kind?: 'demo'|'evaluation'|null; scenario?: string|null`; `runControl.start(gui, scenarioName)` sends `{gui, scenario_name}` (omit when `"default"`); `runControl.startEvaluation(scenarioName)` → `POST /api/control/start-evaluation {scenario_name, baseline: 'vac'}`.
- `liveHistory.pushLiveSample` ignores evaluation frames (`if (!isLive(snapshot)) return` already does once `isLive` is narrowed).
- `scenarios.ts`: `export interface ScenarioInfo { id: string; name: string; blurb: string; demand: 'light'|'moderate'|'heavy'|'ramping' }`; `DEMO_SCENARIOS: ScenarioInfo[]` (default first) and `EVAL_SCENARIOS` (the 13). Copy, exactly:

| id | name | blurb | demand |
|---|---|---|---|
| default | Everyday junction traffic | 480 vehicles an hour from every direction, mixed cars, bikes, autos, buses and trucks, ten minutes | moderate |
| light_seed1 | Light traffic | A quiet junction — a car every few seconds, most lanes empty | light |
| balanced_seed1 | Balanced traffic | Steady, even demand on all four approaches | moderate |
| normal_traffic_seed1 | Normal day | A typical weekday flow with the full vehicle mix | moderate |
| heavy_seed1 | Heavy traffic | Every approach loaded; queues build at every red | heavy |
| extreme_seed1 | Extreme traffic | Saturated on all four arms — the hardest uniform case | heavy |
| rush_hour_seed1 | Rush hour | Demand ramps up, peaks, then eases — the only changing-demand scenario | ramping |
| north_heavy_seed1 | North approach heavy | One arm carries most of the traffic; the others stay light | heavy |
| south_heavy_seed1 | South approach heavy | (same) | heavy |
| east_heavy_seed1 | East approach heavy | (same) | heavy |
| west_heavy_seed1 | West approach heavy | (same) | heavy |
| accident_seed1 | Stalled truck on East | A truck blocks the East straight lane for nine minutes; traffic must be routed around the loss | heavy |
| emergency_response_seed1 | Emergency vehicles | Ambulances and fire engines arrive mid-run and must get through | moderate |
| rain_seed1 | Rain | Slower, more cautious driving; the same demand takes longer to clear | moderate |

- `settings.ts`: zustand store `useSettings` with `{ demoScenario: string; evalScenario: string; setDemo(id); setEval(id) }`, defaults `'default'` / `'extreme_seed1'`, persisted under `trinetra.settings.demoScenario` / `trinetra.settings.evalScenario` (try/catch around `localStorage`).

- [ ] **Step 1:** implement the above; `npx tsc -b` clean.
- [ ] **Step 2: Commit** — `feat(frontend): evaluation snapshot types, scenario table, settings store`.

---

### Task 8: Simulation Settings page

**Files:**
- Create: `frontend/src/pages/SettingsPage.tsx`, `frontend/src/settings/ScenarioCard.tsx`
- Modify: `frontend/src/App.tsx` (route `/settings`), `frontend/src/layout/NavRail.tsx` (entry `Simulation Settings`, icon `SlidersHorizontal`)

**Design:** two `Panel`s ("Overview · demo", "Performance · Trinetra vs VAC"), each a responsive grid (`grid-cols-2 xl:grid-cols-3`) of `ScenarioCard`s. Card: name (Barlow, 15 px, ink-strong), blurb (13 px, ink), demand chip (light = pale, moderate = signal-yellow tint, heavy = signal-red tint, ramping = brown), selected state = 2 px accent border + check icon; `aria-pressed`. When `run.running && run.kind === <section kind>` the panel meta reads "Stop the current run to change" and cards are `disabled`.

- [ ] **Step 1:** build; `tsc`/lint clean; **Step 2: Commit** — `feat(frontend): Simulation Settings page with scenario cards`.

---

### Task 9: Overview + top bar use the selection; evaluation-running message

**Files:**
- Modify: `frontend/src/layout/RunControls.tsx` (Start buttons pass `useSettings().demoScenario`; on `/performance` the Start button calls `runControl.startEvaluation(evalScenario)` and its title reads "Start the evaluation — Trinetra vs VAC"; the "with SUMO window" and "Open window" buttons hide when `pathname === '/performance'` or `run.kind === 'evaluation'`), `frontend/src/pages/OverviewPage.tsx` (scenario chip beside the title linking to `/settings`; when `isEvaluation(latest)` the Digital Twin panel body shows "An evaluation is running — watch it on Performance" with a `<Link to="/performance">`), `frontend/src/analytics/StartPrompt.tsx` (Start uses demo selection).

- [ ] **Step 1:** implement; **Step 2:** `tsc`/lint; **Step 3: Commit** — `feat(frontend): scenario selection flows into Start; Overview knows about evaluations`.

---

### Task 10: `evalHistory` + verdict, with Vitest

**Files:**
- Create: `frontend/src/data/evalHistory.ts`, `frontend/src/data/verdict.ts`, `frontend/src/data/__tests__/evalHistory.test.ts`, `frontend/src/data/__tests__/verdict.test.ts`, `frontend/vitest.config.ts`
- Modify: `frontend/package.json` (`"test": "vitest run"`, devDependency `vitest`), `frontend/src/data/useSocket.ts` (call `pushEvalSample(snapshot)`)

**Interfaces:**
- `verdict.ts`: `export type Verdict = { side: 'trinetra'|'vac'|'even'; pct: number; label: string }`; `verdictFor(improvement: number): Verdict` — `|x| < 0.5` → `{side:'even', pct:0, label:'Even'}`; `x>0` → `{side:'trinetra', pct:x, label:'Trinetra ahead ' + x.toFixed(1) + ' %'}`; else `{side:'vac', pct:-x, label:'VAC ahead ' + (-x).toFixed(1) + ' %'}`.
- `evalHistory.ts`: `export interface EvalSample { t: number; ai: Record<string, number>; vac: Record<string, number> }` keyed by `ComparisonRow.key`; `pushEvalSample(snapshot: Snapshot)` (ignores non-evaluation frames; resets when `sim_time` goes backwards or `scenario` changes); `getEvalSamples()`; `clearEvalHistory()`; `useEvalHistory` zustand `{ revision, count, final: boolean, scenario: string|null, rows: ComparisonRow[] }` with the same 1 s revision gate as `liveHistory`.

- [ ] **Step 1: Failing tests** — `verdictFor(0.3).label === 'Even'`, `verdictFor(62.5).side === 'trinetra'`, `verdictFor(-3.1).label === 'VAC ahead 3.1 %'`; evalHistory: three evaluation frames with rising `sim_time` → `getEvalSamples().length === 3` and `useEvalHistory.getState().final === false`; a frame with `comparison.final: true` → `final === true`; a frame with a lower `sim_time` → history cleared.
- [ ] **Step 2:** `npm i -D vitest` (pin the current major), `vitest.config.ts` with `test: { environment: 'node', include: ['src/**/__tests__/**/*.test.ts'] }`; run → fails. **Step 3:** implement. **Step 4:** `npm test` → pass. **Step 5: Commit** — `feat(frontend): evaluation history accumulator and verdict rule (Vitest)`.

---

### Task 11: Performance page

**Files:**
- Create: `frontend/src/pages/PerformancePage.tsx`, `frontend/src/performance/ControllerWindow.tsx`, `frontend/src/performance/MetricBlock.tsx`, `frontend/src/performance/EvalStartPrompt.tsx`
- Modify: `frontend/src/App.tsx` (route), `frontend/src/overview/TwinViewport.tsx` (`allow3d?: boolean` default true; when false the Plan/3D toggle is not rendered and mode is fixed to plan)

**Design:**
- `ControllerWindow({ title, side: SideView|null, powered })`: `Panel` titled "Trinetra" / "Vehicle-actuated control"; meta row from `side`: active phase in plain words (`PHASE_LABEL` map already used by Overview's active-phase panel — reuse it), `metrics.vehicles` vehicles, `metrics.avg_wait` mean wait; body `TwinViewport lanes={side.lanes} emergencyLanes={[]} vehicles={side.vehicles} powered={powered} allow3d={false}`.
- `MetricBlock({ row: ComparisonRow, samples: EvalSample[], final })`: title = `row.label` with the unit; two-line SVG time series (same construction as `NetworkTrendLines`: `viewBox 0 0 W H`, `preserveAspectRatio="none"`, polyline per side; colours `var(--signal-green)` for Trinetra and the existing baseline brown token used by phase-history "hold"); current values "Trinetra 4.25 s · VAC 12.01 s"; verdict badge from `verdictFor(row.improvement)` with the suffix "so far" / "final"; for `key === 'throughput_vehicles'` a footnote "tied by construction — both controllers serve the same vehicles".
- `EvalStartPrompt`: like `StartPrompt` but titled "Trinetra vs VAC — nothing running yet", shows the selected scenario name, a Start button calling `runControl.startEvaluation(evalScenario)`, a link to Settings; when `run.kind === 'demo'` it says "A demo run is active — stop it on Overview to start an evaluation".
- `PerformancePage`: header chip (scenario name from `scenarios.ts` + "vs Vehicle-Actuated Control" + Settings link); if no evaluation snapshot → `EvalStartPrompt` in place of the two windows; else `grid-cols-2` of `ControllerWindow`s, then a summary line when `final` ("Trinetra ahead on k of 7"), then the seven `MetricBlock`s in a `grid-cols-2 xl:grid-cols-3` (throughput last, full-width note). Ended-run handling mirrors Overview: windows go unpowered when `run.available && !run.running` but the blocks keep their final state.

- [ ] **Step 1:** build; `tsc`/lint/build clean. **Step 2: Commit** — `feat(frontend): Performance page — two live junctions, seven metric blocks with verdicts`.

---

### Task 12: Vehicle rendering — plate lengths, 3D silhouettes, plain labels

**Files:**
- Modify: `frontend/src/overview/vehicleTypes.ts` (`plateSize`), `frontend/src/overview/Junction3D.tsx` (`bodyFor`/`buildVehicle`), `frontend/src/overview/plateGeometry.ts` (`labelPos` + a `LABELS` map), `frontend/src/overview/JunctionPlate.tsx` (label text), `frontend/src/overview/LaneTable.tsx`, `frontend/src/analytics/LaneLedger.tsx`

- [ ] **Step 1 — plate lengths:** `const PLATE_UNITS_PER_METRE = 920 / 400` in `vehicleTypes.ts`; `plateSize(shape)` returns `{ length: Math.round(shape.length * PLATE_UNITS_PER_METRE * 10) / 10, width: <today's width per kind> }`. Update the doc comment: length is true-scale so queues draw at SUMO's spacing; width stays exaggerated for legibility.
- [ ] **Step 2 — 3D silhouettes:** in `bodyFor`, branch on `kind`:
  - `motorcycle`: body = `BoxGeometry(0.35, 0.35, L*0.7)` (frame, at y = 0.55); two `CylinderGeometry(0.33, 0.33, 0.12, 14)` wheels rotated `z = π/2` at `z = ±L*0.36`, y = 0.33, colour `#1a1a1a`; rider = `BoxGeometry(0.4, 0.7, 0.45)` at y = 1.05, z = −0.1, painted in the vType colour; no cab.
  - `rickshaw`: cab = `BoxGeometry(Wd, Ht*0.75, L*0.72)` at y = Ht*0.5, z = −L*0.08 (yellow body); canopy = `BoxGeometry(Wd*1.02, 0.08, L*0.75)` at y = Ht − 0.04, colour `#1a1a1a`; three wheels: one front `(0.28 r)` at z = +L*0.42, two rear at z = −L*0.32, x = ±Wd*0.42, y = 0.28, colour `#1a1a1a`; no glass cab.
  - others unchanged. Cache per `key` as today; the geometries are `own()`ed.
- [ ] **Step 3 — plain labels:** `plateGeometry.ts` exports `LANE_LABEL: Record<string,string>` = `{N_in_0:'North · Left', N_in_1:'North · Straight', N_in_2:'North · Right', S_in_0:'South · Left', …, W_in_2:'West · Right'}`; `labelPos` for `axis==='v'` returns three stacked rows: N labels at `y = 14 + 13*i` where `i` = lane index within the arm (0..2) all anchored `x = (460+568)/2` (N) / `(352+460)/2` (S), i.e. a small three-line legend per vertical arm instead of one label per lane column; E/W unchanged. `JunctionPlate` renders `LANE_LABEL[g.id]`. `LaneTable`/`LaneLedger`: replace the `Lane` + `Movement` columns with one `Lane` column showing `LANE_LABEL[id]`.
- [ ] **Step 4 — verify numerically** (browser console or a small script against `placeVehicles` with two stopped vehicles 7 m apart on N_in_1): front-to-rear distance ≥ 0 with the new lengths; `tsc`/lint/build clean.
- [ ] **Step 5: Commit** — `fix(frontend): true-scale plate vehicles, real motorcycle/auto silhouettes, plain lane labels`.

---

### Task 13: End-to-end verification, docs, memory

**Files:** `README.md`, `CLAUDE.md`, `PROJECT_ARCHITECTURE_REPORT.md` (Section 27), `frontend/README.md`, `docs/ONBOARDING.md`.

- [ ] **Step 1:** `cd frontend && npm run build`; `cd backend && python -m pytest ../tests/ -q`; restart `python server.py`.
- [ ] **Step 2 (Playwright, one pass):** `/settings` → select Extreme in the Performance section (assert `localStorage` key) → `/performance` → Start → wait 40 s → screenshot (both plates animating, blocks filling) → Pause → two snapshots 3 s apart have equal `sim_time` → Resume → speed 5× → sim_time advances ≥ 4× faster than wall → Stop → `comparison.final === true` in the last frame, summary line visible, `results/comparison_extreme_seed1.csv` mtime fresh. Then `/settings` → Rush hour for Overview → `/` → Start → chip reads "Rush hour" and `run-state.scenario === 'rush_hour_seed1'`. Then screenshots: a stopped queue on the plate (no overlap), and 3D close-ups of a motorcycle and an auto-rickshaw. Read every screenshot.
- [ ] **Step 3:** docs — README (console section: Settings page, Performance page, `start-evaluation`), CLAUDE.md (Control layer: `start-evaluation`, one-at-a-time, `kind`; Frontend: Performance built, Settings built, Decisions still placeholder; snapshot `kind`), report Section 27 (what/why/evidence incl. screenshots list), frontend/README (status), ONBOARDING (page list). Memory: update `current-state-…` and `frontend-iteration-1-stitch`.
- [ ] **Step 4: Commit + push** — `feat: Performance page, Simulation Settings, vehicle rendering fixes (Section 27)`.
