# Trinetra — dashboard frontend

React + Vite + TypeScript + Tailwind v4. Read-only viewer over the backend's
`WS /ws` snapshot stream and the `GET /api/*` routes. The backend is unchanged.

## Status — iteration 1 (Overview page only)

The layout is ported from an approved Stitch export
(`docs/design/` has the design brief). What exists:

- **Overview** (`/`) — junction plate (hero), active-phase panel with the
  Desired-vs-Actual pair, 12-lane ledger with plate cross-highlight,
  dual-track ring-barrier phase history, metrics band.
- App shell: status bar (sim clock, link state with staleness, emergency
  slot), nav rail, footer with a **dev-only palette switcher** (`field` /
  `slate` / `clay`) for comparing the three candidate palettes on the live
  layout. It will be removed once one is chosen.
- States: waiting-for-simulation (plate unpowered + one line), link lost
  (page dims, last values stay), prediction unavailable.
- **Digital twin, Performance, Decisions** are honest placeholders — iteration 2.

Every value on screen traces to a real field in `src/data/types.ts`, which is
transcribed from `backend/app.py`'s publish call. Nothing is invented.

## Things verified against source, not assumed

- Junction geometry: `sumo/network/intersection.net.xml` has `lefthand="true"`;
  lane shapes put every inbound carriageway on the driver's left, kerb lane
  (`_in_0`) = left turn. `src/overview/plateGeometry.ts` documents the coordinates.
- Decision modes: six (`priority`, `gap_out`, `light_traffic_patience`,
  `emergency`, `starvation_override`, `min_green_hold`), from
  `decision_engine.py`. The previous frontend only knew four.
- `prediction.avg_confidence` is a **0–100** score (`ml_predictor.py`), not 0–1.
- `signal.countdown` is only a real countdown **during amber** (3 s clearance).
  During green the SignalController re-arms SUMO's next-switch to a 60 s
  provisional ceiling every tick, so it is not "time until the AI switches".
  `decision.duration` is elapsed green. The hero numeral reflects this.
- Min/max green per phase (`src/utils/phaseWindows.ts`) mirrors
  `decision_config.py` defaults — static config the snapshot doesn't carry.

## Running

```bash
# terminal 1 — backend (from backend/); press ▶ in the SUMO window
python app.py

# terminal 2 — frontend (from frontend/)
npm install
npm run dev          # http://localhost:5173, proxies /api and /ws to :8000
```

Production: `npm run build` → `frontend/dist`, served by `dashboard_server.py`
at http://127.0.0.1:8000 when `python app.py` runs.

Checks: `npx tsc -b`, `npm run lint`, `npm run build` — all clean as of this
iteration. Fonts (IBM Plex Sans/Mono) and icons are vendored; no CDN at runtime.

## Not yet done

- No visual verification by the author of this iteration (no browser tool in
  the build environment). Look at it before trusting it.
- The Trinetra logo file was lost when `frontend/` was emptied (it was never
  committed). A plain wordmark stands in; re-supply the asset.
- Replay fixtures and a screenshot script are not built yet.
