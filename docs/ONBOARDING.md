# Onboarding — getting a working Trinetra on your machine

This is the shortest path from a fresh clone to the console running in your
browser, plus how to work on your own branch without disturbing `main`.
Everything here was verified on Windows 11 on 2026-09-13; the commands are
the same on macOS/Linux with the obvious path changes.

## 0. What you need installed

| tool | version | notes |
|---|---|---|
| Git + **Git LFS** | any recent | `git lfs install` once. The trained model (~250 MB) is stored through LFS; without it you get a 130-byte pointer file and the AI runs with no predictor. |
| Python | 3.10+ (3.13 is what `main` is developed on) | |
| SUMO | 1.27 | https://sumo.dlr.de/docs/Downloads.php — install the full package, then set `SUMO_HOME` (Windows default `C:\Program Files (x86)\Eclipse\Sumo\`) and make sure `sumo`/`sumo-gui` are on `PATH`. |
| Node.js | 20+ | needed once to build the UI (`frontend/dist` is not in git), and for any frontend work |

Check SUMO is reachable before anything else:

```bash
python -c "import os; print(os.environ.get('SUMO_HOME'))"   # must print the SUMO directory
sumo --version
```

## 1. Clone and set up

```bash
git lfs install
git clone https://github.com/Uzumaki-Chethan/traffic-digital-twin.git
cd traffic-digital-twin
git lfs pull                       # fetches the model + calibrators (LFS objects)

python -m venv .venv
.venv\Scripts\activate             # Windows     (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt    # note: this file is UTF-16 encoded; pip reads it fine
```

`traci` and `sumolib` are in `requirements.txt` as pip packages, but they must
match your SUMO version. If `import traci` fails or complains about a version
mismatch, add `%SUMO_HOME%\tools` to `PYTHONPATH` instead.

Build the UI once (the built files are not committed):

```bash
cd frontend
npm install
npm run build        # writes frontend/dist, which server.py serves
cd ..
```

## 2. Prove it works (2 minutes, no browser needed)

```bash
cd backend
python -m pytest ../tests/ -q       # expect: 65 passed (offline, no SUMO involved)
python -m performance.evaluator --scenario light_seed1 --baseline vac
```

The second command runs two SUMO simulations in lockstep (AI vs the
vehicle-actuated baseline) for ~2 minutes and prints a 7-metric comparison
table; it should end with `Saved: results/comparison_light_seed1.csv`. If it
runs, your SUMO + TraCI + model setup is complete.

## 3. Run the console

```bash
cd backend
python server.py                    # http://127.0.0.1:8000
```

Open that URL, press **Start** in the top bar, and you have a live
simulation drawn in the browser (Plan and 3D views, Analytics page). Stop
it from the same bar. **Simulation Settings** picks the scenario for the
Overview demo and for the Performance page; **Performance** runs Trinetra
against vehicle-actuated control side by side with a verdict per metric.
`python app.py` is the older one-run alternative (opens sumo-gui directly).

`server.py` serves whatever is in `frontend/dist` (built in step 1). While
you change anything under `frontend/src`:

```bash
cd frontend
npm run dev          # live-reload dev server on :5173, proxies the API to :8000
npm run build        # rebuilds frontend/dist for server.py to serve
```

## 4. Working on your own branch

`main` is the reference version — the numbers in `README.md` were measured
on it, and the owner keeps it green. Do your work on a branch named after
you or the idea, and push that branch:

```bash
git checkout -b design/<your-name>        # e.g. design/rahul
# ... work, commit as you go ...
git push -u origin design/<your-name>
```

Rules of the road:

- **Never commit to `main` directly.** When your design is ready, open a
  pull request from your branch; if it's adopted it gets merged, if not it
  stays as a branch — either way `main` is never broken by work in progress.
- **Run the tests before every push**: `cd backend && python -m pytest ../tests/ -q`.
- **Don't commit generated files**: `datasets/*.csv` (the built train/test
  files), `results/*.csv` from your own experiment runs, screenshots, or
  `data/*.db`. The `.gitignore` already excludes most of these.
- **Don't retrain or regenerate datasets on your branch** unless that IS
  your task — it takes ~2 hours of SUMO time and produces a 250 MB LFS
  object per retrain. Ask first.
- The rules the whole project follows are in `CLAUDE.md` at the repo root
  (architecture boundaries, what "done" means, the known deviations). Read
  it once; Claude Code reads it automatically every session.
- **For UI work, `docs/UI_CHANGE_RULES.md` is the contract:** restyle,
  recolour, move or add anything; never drop an item of its content
  inventory without the owner saying so in writing. Tick the inventory for
  every page you touched before you push. `git tag prototype-1` is the state
  it describes and the point everything can be taken back to.

## 5. Working with Claude Code on this repo

The same Claude Code account is shared across the team. Claude reads
`CLAUDE.md` and its own memory notes at the start of each session, so it
already knows the architecture, the standing rules, and that branches other
than `main` are teammates' work. Two things to tell it at the start of your
first session so it doesn't assume it's talking to the owner:

1. who you are and which branch you're on (`git branch --show-current`);
2. that your task is a **UI/design direction on your own branch**, not a
   change to `main`, the model, or the datasets.

If it proposes something outside your branch's scope (retraining, changing
the signal program, touching the evaluation), it's following the "explain
before implementing" rule — say no, or point it back at your branch.

## 6. Where things live

| what | where |
|---|---|
| project rules, known deviations, commands | `CLAUDE.md` |
| quick start, results, status | `README.md` |
| the full engineering history (read the highest-numbered `SECTION N — … (CURRENT STATE)` first) | `PROJECT_ARCHITECTURE_REPORT.md` |
| the UI design brief (data rules, banned defaults, page plan) | `docs/design/TRINETRA_UI_DESIGN_BRIEF.md` |
| what's verified vs. still open in the frontend | `frontend/README.md` |
| backend entry points | `backend/server.py` (console), `backend/app.py` (one run) |
| the trained model (LFS) | `backend/ml/trained_models/` |
| SUMO network, routes, scenarios | `sumo/` |
| evaluation results (git-tracked) | `results/comparison_<scenario>.csv` |

## 7. If something doesn't work

- `ModuleNotFoundError: traci` → `SUMO_HOME` not set, or `%SUMO_HOME%\tools`
  not on `PYTHONPATH`.
- Console starts but Start does nothing / errors → SUMO binary not on
  `PATH`; check `sumo --version` from the same shell.
- AI runs but predictions panel is empty → LFS objects not pulled
  (`git lfs pull`); `backend/ml/trained_models/random_forest_predictor.joblib`
  should be ~250 MB, not 130 bytes.
- Port 8000 already in use → another `server.py` is still running (it
  survives closing the editor); kill it or use the existing one.
- Console shows "no frontend build found" → run `npm run build` in `frontend/`.
