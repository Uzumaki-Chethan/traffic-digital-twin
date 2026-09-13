# Trinetra — dashboard frontend

React + Vite + TypeScript + Tailwind v4. A viewer over the backend's `WS /ws`
snapshot stream and `GET /api/*`, plus the narrow control surface in
`backend/services/control_routes.py` (start / pause / stop / speed).

## Status

Built from a Stitch export whose layout the user approved, then iterated on
colour and typography over about fifteen rounds (`docs/design/` has the brief).

- **Overview** (`/`) — the junction as the hero, in either a schematic plan view
  (scroll to zoom, drag to pan) or an interactive 3D miniature (`TwinViewport`
  toggles; 3D is lazy-loaded as its own chunk). Both draw the real SUMO vehicles,
  as their real types — a bus is a bus. Under it, **Prediction vs actual**: the only
  place the ML layer appears in the UI. Beside it: the active-phase panel with the
  Desired-vs-Actual pair, the 12-lane ledger with plate cross-highlight, a
  dual-track ring-barrier phase history, and the metrics band.
- **Analytics** (`/analytics`) — the run happening now, in detail: lane-pressure
  heatmap, lane ledger, network trend lines, congestion by bucket, decision-mode
  donut, phase share, green-duration histogram, speed-vs-wait scatter, peak
  windows. All derived from the live stream (`data/liveHistory.ts` →
  `analytics/series.ts`), never from the database — see below.
- **Performance**, **Decisions** — honest placeholders.
- App shell: status bar (sim clock, run controls, link state with staleness,
  emergency slot), nav rail, footer.

Every value on screen traces to a real field in `src/data/types.ts`, which is
transcribed from `backend/simulation_runner.py`'s publish call. Nothing is invented.

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

## Things verified against source, not assumed

- Junction geometry: `sumo/network/intersection.net.xml` has `lefthand="true"`;
  lane shapes put every inbound carriageway on the driver's left, kerb lane
  (`_in_0`) = left turn. `src/overview/plateGeometry.ts` documents the plan-view
  coordinates; `Junction3D.tsx` documents the true-scale 3D ones (9.6 m
  carriageway, 21.6 m to the stop line, 178.4 m arms). Vehicle placement was
  wrong on all four approaches until 2026-09-13 and was only caught by re-deriving
  it from the network file — check geometry against source, never by eye.
- Junction paths: the twelve `<connection ... via=":C_n_0">` elements give each
  internal lane its from/to arm and lane. `vehiclePlacement.ts` uses them so a
  turning vehicle follows its actual movement across the junction; verified to
  hand off with zero discontinuity at both ends of all twelve.
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
