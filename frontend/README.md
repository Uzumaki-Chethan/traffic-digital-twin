# Trinetra — dashboard frontend

React + Vite + TypeScript + Tailwind v4. A viewer over the backend's `WS /ws`
snapshot stream and `GET /api/*`, plus the narrow control surface in
`backend/services/control_routes.py` (start / pause / stop / speed).

## Status

Built from a Stitch export whose layout the user approved, then iterated on
colour and typography over about fifteen rounds (`docs/design/` has the brief).

- **Overview** (`/`) — the junction as the hero, in either a true-scale plan view
  (one SVG unit = one metre; Ctrl + scroll or pinch to zoom about the pointer,
  drag to pan, 1× = the whole 400 m network, 3.5× on opening and under the
  "frame the junction" button; a plain scroll is left to the page) or an interactive 3D
  miniature (`TwinViewport` toggles; 3D is lazy-loaded as its own chunk). Both
  draw the real SUMO vehicles at their real `length × width`, as their real
  types — a bus is a bus, and a queue looks as it does in sumo-gui. Under it, **Prediction vs actual**: the only
  place the ML layer appears in the UI. Beside it: the active-phase panel with the
  Desired-vs-Actual pair, the 12-lane ledger with plate cross-highlight, the
  score ledger (`ScoreLedger`: four phase scores + the dashed decision boundary
  at served score + `decision.margin`) beside the last five switches
  (`RecentSwitches`, from the snapshot's `phase_history`), a dual-track
  ring-barrier phase history, and the metrics band.
- **Analytics** (`/analytics`) — the run happening now, in detail: lane-pressure
  heatmap, lane ledger, network trend lines, congestion by bucket, decision-mode
  donut, phase share, green-duration histogram, speed-vs-wait scatter, peak
  windows. All derived from the live stream (`data/liveHistory.ts` →
  `analytics/series.ts`), never from the database — see below.
- **Performance** (`/performance`) — Trinetra vs VAC on the identical scenario,
  live: two `JunctionPlate`s fed from `snapshot.ai` / `snapshot.baseline` of an
  evaluation frame, then seven `MetricBlock`s (two-line SVG time series, both
  current values, a verdict badge from `data/verdict.ts` — "Even" inside
  ±0.5 %). History accumulates in `data/evalHistory.ts`, the sibling of
  `liveHistory.ts`; the verdicts lock when `comparison.final` arrives. The two
  plates pan and zoom independently; each carries a Match button that adopts
  the other's framing (`TwinViewport`'s `matchView`).
- **Simulation Settings** (`/settings`) — one grid of scenario cards and a
  "Choose for" dropdown (Overview / Performance) saying which page a click
  selects for; cards mark the page(s) using them (`data/scenarios.ts` holds the
  plain-language names; ids never render). Selection and the dropdown's target
  are kept in `localStorage` via `data/settings.ts`; Balanced is the demo
  default, Extreme the evaluation's. The production route (`default`) keeps a
  name for runs started without a scenario but has no card.
- **The top bar is per page** (`data/pageContext.ts` → `layout/RunControls.tsx`,
  `layout/StatusBar.tsx`): Performance's Start/Pause/Stop drive the evaluation,
  Overview's and Analytics' the demo, Settings' the page its dropdown names
  (then navigates there). When the other kind of run is up, Start ends it and
  starts this page's (`runState.replaceWithDemo/Evaluation`: stop, poll until
  idle, start — `busy` held throughout). A "Scenario: …" chip beside the
  controls names the page's scenario and links to Settings; the footer's right
  side names the backend host and stream state (the rate is in the status bar).
  Performance never shows a placeholder: idle, it draws both junctions dark and
  seven `EmptyMetricBlock`s. A run of the other kind is "nothing running" from a
  page's point of view: Overview sits dark during an evaluation, Performance
  during a demo, and the status bar's clock, Live pill and mode chip follow the
  page (`foreign` in `StatusBar`), as does `PhasePanel`'s held-seconds counter
  (`powered`).
- **Decisions** (`/decisions`) — the audit trail, the only page that reads the
  database: `decisions/useDecisionLog.ts` (runs list, one run's rows walked with
  `after_id`, live follow), `DecisionList` (windowed, 30 px rows, ↑/↓),
  `DecisionDetail` (reason, desired vs actual, `ScoreLedger` from the row's stored
  scores + margin). Rule chips filter; switches are marked against the full run.
- App shell: status bar (sim clock, run controls, link state with staleness,
  emergency slot), nav rail, footer (the page's own one-line description on the
  left, the measured simulation rate on the right).

Every value on screen traces to a real field in `src/data/types.ts`, which is
transcribed from `backend/simulation_runner.py`'s publish call. Nothing is invented.

Frames arrive five times per simulated second whatever the speed — a decision
tick (`tick: true`) plus four motion frames (`tick: false`, positions only; the
histories skip them) — and the server pushes on change. Vehicle motion is
`data/motion.ts`: a per-fleet buffer of the last frames and a display clock that
draws 250 ms behind the newest one, interpolating position and SUMO's own
heading (`angle`) between the bracketing frames from a rAF loop (`VehicleLayer`
on the plate, the same in `Junction3D`) — no CSS tweens, no React render per
frame. `smooth` switches to "draw the newest frame" if a frame ever spans
> 1.6 simulated seconds (a slow link), and `useSim.reset()` forgets everything
when `run-state.started_at` changes.

## Why Analytics reads the live stream and not SQLite

Two reasons, both load-bearing:

1. **Simulated time restarts at zero every run.** A database-wide average at
   "t = 120 s" was an average across a different moment in every recorded run.
2. **The history endpoints used to die with the simulation.** They are served by
   a process that, under `python app.py`, *is* the simulation — so closing SUMO
   502'd the whole page. `python server.py` fixes that (the console outlives any
   run), but the page is still better off showing one run than all of them.

The database is still written exactly as before. It is the audit trail and the
source of the report's figures; the Performance and Decisions pages will read it.
See `PROJECT_ARCHITECTURE_REPORT.md` Section 23.4 before changing this back.

## Motion

One vocabulary, in `src/ui/motion.ts`, in step with the `--dur-*` / `--ease-*` tokens in
`src/styles/tokens.css` - change them together. Duration follows distance (`tick` 120ms
for a state flip, `phase` 900ms for the signal choreography); exits run at 65% of their
enter. It is spent in four places, in priority order:

1. **The release** - on the confirmed green, light runs once along the painted arrow in
   the direction of travel and a ring blooms out of the green lens. Triggered by
   `utils/signal.phaseKey()`, a *derived* key (the simulated second the phase began), so
   there is no previous-state tracking and the Performance page's two plates cannot
   trigger each other.
2. **Data in motion** - numbers and bars tween over `--dur-value`; the clocks are
   extrapolated against `performance.now()` between packets.
3. **An answer to every pointer** - sliding nav indicator, `.grow-rule` hairlines, accent
   bars that scale from the leading edge, 0.97 press scales.
4. **Arrival, once per page** - `Reveal`, 14px over 420ms, 70ms apart, on mount only.

Still banned: anything looping in the periphery (the amber lamp excepted), glow pulses,
spinners past 300ms, and any code whose correctness depends on an animation finishing.
Everything honours `prefers-reduced-motion`. See `PROJECT_ARCHITECTURE_REPORT.md`
Section 29 and section 5.4 of the design brief.

## Things verified against source, not assumed

- Junction geometry: `sumo/network/intersection.net.xml` has `lefthand="true"`;
  lane shapes put every inbound carriageway on the driver's left, kerb lane
  (`_in_0`) = left turn. `src/overview/plateGeometry.ts` holds the plan-view
  geometry in metres (since 2026-09-14 the plan is a map, not a schematic) and
  `Junction3D.tsx` the same numbers for the 3D scene (9.6 m carriageway, 21.6 m
  to the stop line, 178.4 m arms, 12 m corner fillets). Vehicle placement was
  wrong on all four approaches until 2026-09-13 and was only caught by re-deriving
  it from the network file — check geometry against source, never by eye.
- Junction paths: the twelve `<connection ... via=":C_n_0">` elements give each
  internal lane its from/to arm and lane (`junctionTopology.ts`). Vehicles are
  drawn at their SUMO coordinates, so nothing re-routes them; the table gives a
  vehicle its first heading before it has moved.
- Vehicle types and dimensions come from the frozen `vehicle_types.add.xml`, held
  in `src/overview/vehicleTypes.ts` — the snapshot sends only the type id.
- Decision modes: six (`priority`, `gap_out`, `light_traffic_patience`,
  `emergency`, `starvation_override`, `min_green_hold`), from
  `decision_engine.py`. The first frontend only knew four.
- `signal.countdown` is only a real countdown **during amber** (3 s clearance).
  During green the SignalController re-arms SUMO's next-switch to a 60 s
  provisional ceiling every tick, so it is not "time until the AI switches".
  `decision.duration` is elapsed green. The hero numeral reflects this.
- Min/max green per phase (`src/utils/phaseWindows.ts`) mirrors
  `decision_config.py` defaults — static config the snapshot doesn't carry.
- Prediction confidence exists in the data and is deliberately **never shown**
  anywhere in the UI, by standing instruction from the user.
- Which controls to show is read from `GET /api/control/run-state`, never
  assumed: `server.py` can start runs, `app.py` cannot, the evaluator's own
  dashboard can do neither.

## Running

```bash
# terminal 1 — backend (from backend/)
python server.py     # console; press Start in the UI

# terminal 2 — frontend (from frontend/)
npm install
npm run dev          # http://localhost:5173, proxies /api and /ws to :8000
```

Production: `npm run build` → `frontend/dist`, served by `dashboard_server.py`
at http://127.0.0.1:8000 by whichever backend entry point is running.

Checks: `npx tsc -b`, `npm run lint`, `npm run build` — all clean. Fonts
(Orbitron for display, Barlow for UI, JetBrains Mono for numbers) and icons are
vendored; no CDN at runtime.

## Not yet done

- **No visual verification by the author** (no browser tool in the build
  environment). Geometry, contrast and data wiring are verified against source
  and against a live backend; how it actually *looks* is not. Look at it.
- The Trinetra logo file was lost when `frontend/` was emptied (it was never
  committed). A plain wordmark stands in; re-supply the asset.
- Replay fixtures and a screenshot script are not built yet.
