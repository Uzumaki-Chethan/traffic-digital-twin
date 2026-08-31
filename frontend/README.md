# Traffic Command Center — Frontend v2

A ground-up rebuild of the dashboard for the AI-Driven Adaptive Traffic
Digital Twin project, replacing the original single-file
`frontend/dashboard.html` with a proper React application. **The Python
backend's control-loop architecture is unchanged** — this only touches
the presentation layer, plus a few additive, read-only API routes
described below.

## Stack

- **Vite + React 19 + TypeScript** — strict typecheck, zero `any` outside
  one intentionally-loose chart-data prop
- **Tailwind CSS v4** (`@theme` tokens, no config file needed)
- **Zustand** — single store for the live snapshot + a client-side
  rolling trend buffer (the backend only publishes instantaneous state)
- **Recharts** — trend lines and the AI-vs-baseline bar comparison
- **react-router-dom** — 4 routed pages, lazy-loaded per route
- **IBM Plex Sans / IBM Plex Mono**, self-hosted via `@fontsource` (no
  external font CDN — works fully offline during a demo)

## Design system

A graphite-navy "control room" theme, not pure black. One fixed 6-color
signal system used consistently everywhere (`src/utils/theme.ts` is the
single source of truth — don't hardcode these colors elsewhere):

| Color   | Meaning                                        |
|---------|-------------------------------------------------|
| Green   | Flow / signal GO / AI improved on a metric      |
| Red     | Stop / signal STOP / AI regressed / emergency   |
| Yellow  | Transition / signal clearance                   |
| Blue    | Neutral data / normal decision mode             |
| Violet  | AI / prediction-related                         |
| Orange  | Starvation-override warning                     |

All live numeric readouts use `font-mono` with tabular figures so digits
don't jitter as values update.

## Pages

1. **Digital Twin** (`/`) — the core real-time view. A live SVG schematic
   of the *actual* verified intersection (real lane IDs, colored by each
   lane's own live SUMO signal character, not just the aggregate phase
   name), a phase countdown ring, KPI cards, per-lane density bars, the
   Decision Engine's reasoning + per-phase priority scores, a 60-second
   phase timeline, and the prediction-vs-actual table.
2. **Performance** (`/performance`) — live AI-vs-baseline comparison when
   the evaluator is running with `--dashboard`, client-side trend charts
   for the current run, and a list of previously saved evaluation runs
   (parsed from `results/comparison_*.csv`).
3. **Scenario Control** (`/scenarios`) — **honest by design**: the
   backend deliberately has no HTTP endpoint to start/stop/reconfigure a
   simulation (see `dashboard_server.py`'s pure-viewer rule), so this
   page doesn't pretend otherwise. It shows what's currently running
   (inferred from the live stream) and gives copy-to-clipboard terminal
   commands for every real scenario config on disk. It also flags a real
   gap found while building this: `sumo/config/demo/*.sumocfg` exists but
   isn't wired into `evaluator.py` (which only reads from
   `sumo/config/scenarios/`).
4. **Logs & Insights** (`/logs`) — a filterable table over the
   `decision_log` SQLite table, with "switch vs held" derived client-side
   by diffing consecutive rows (the table itself doesn't store a switch
   flag).

## Backend changes required

Two small, additive, read-only patches — **already applied** to this
checkout's `backend/`, but you'll need to apply the same diff to your
own copy of the repo (see `backend-changes.patch` alongside this
README, or the summary below):

1. **`backend/app.py`** — the live `decision` payload now also includes
   `duration` (seconds elapsed in the current phase — needed for the
   countdown ring) and `phase_scores` (the per-phase priority scores
   already computed by `DecisionEngine.decide()`, just not previously
   exposed). Both are read straight off the already-built `Decision`
   object; no new computation.
2. **`backend/services/dashboard_server.py`** —
   - Added `GET /api/logs/decisions`, `GET /api/logs/performance`,
     `GET /api/logs/predictions` (read-only SQLite queries against the
     existing `decision_log` / `performance_log` / `prediction_log`
     tables) and `GET /api/results` (parses `results/comparison_*.csv`).
   - The `/` route now serves this app's production build
     (`frontend-v2/dist/`) if present, falling back to the legacy
     `frontend/dashboard.html` if not.
   - **No POST routes were added.** The pure-viewer architecture rule in
     that file's docstring still holds.

## Running it

**Development** (hot reload, recommended while iterating on the UI):

```bash
# terminal 1 — backend, from backend/
python app.py

# terminal 2 — frontend, from frontend-v2/
npm install
npm run dev
```

Open `http://localhost:5173`. Vite's dev server proxies `/api` and `/ws`
to `127.0.0.1:8000` (see `vite.config.ts`) — no CORS setup needed.

**Production** (single process serves everything):

```bash
cd frontend-v2
npm install
npm run build          # writes frontend-v2/dist/

cd ../backend
python app.py           # now serves the built UI at http://127.0.0.1:8000
```

**Checks** (all pass as of this build):

```bash
npx tsc -b --noEmit     # 0 errors
npm run lint            # oxlint — 0 warnings
npm run build           # succeeds, ~242KB gzipped main bundle
                         # (Recharts is isolated to the Performance page's
                         # own lazy chunk, so it's only fetched when visited)
```

## Known data-fidelity notes (read before demoing)

- The countdown ring's "min/max green" labels are a **frontend-only
  duplicate** of `decision_engine.py`'s `MIN_GREEN_SECONDS` /
  `MAX_GREEN_SECONDS` constants (`src/utils/decisionConstants.ts`), kept
  in sync manually. If those are ever retuned in the backend, update
  this file too.
- Trend charts on the Performance page are built from a **client-side
  rolling buffer** (last 300 samples), not a backend time series — the
  backend only ever publishes the latest instantaneous snapshot.
- The Logs page's "switch vs held" column is **derived**, not stored —
  `decision_log` has no switch flag, so it's computed by comparing each
  row's phase to the previous row's.
