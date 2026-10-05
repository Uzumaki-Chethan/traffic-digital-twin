# Setting up Trinetra

Everything needed to get the whole project running after cloning it: the simulation, the AI
and the web console, plus the optional physical model. Allow 30–45 minutes the first time,
mostly downloads.

The steps are written for **Windows**. macOS and Linux differ only where noted.

---

## 1. Install the tools

| Tool | Get it from | Notes |
|---|---|---|
| **Git** (with **Git LFS**) | git-scm.com | Git for Windows includes Git LFS. On macOS/Linux, also install `git-lfs` (`brew install git-lfs`, or `sudo apt install git-lfs`). LFS is needed for the AI model file. |
| **Python 3.11 – 3.13** | python.org | On Windows, **tick "Add python.exe to PATH"** on the installer's first screen. |
| **SUMO 1.27** | eclipse.dev/sumo → Download | The traffic simulator. On Windows, use the 64-bit installer and let it **set `SUMO_HOME`**. On macOS/Linux, install it and set `SUMO_HOME` yourself (see SUMO's install page). 1.27 matches the project's `traci`/`sumolib`. |
| **Node.js 22 LTS** | nodejs.org | Builds the web console. |
| *(physical model only)* **CP210x USB driver** | silabs.com → "CP210x USB to UART Bridge VCP Drivers" | Often installs by itself when the ESP32 is plugged in. |

**Close and reopen your terminal after installing**, so it sees the new PATH and `SUMO_HOME`.

---

## 2. Clone the project, including the AI model

In **Command Prompt** (Windows) or a terminal:

```bat
git clone https://github.com/Uzumaki-Chethan/traffic-digital-twin.git
cd traffic-digital-twin
git lfs install
git lfs pull
```

**Check:** `backend/ml/trained_models/random_forest_predictor.joblib` should be about
**258 MB**. If it's under 1 KB, it's only an LFS pointer; run `git lfs pull` again.

> Don't use GitHub's **Download ZIP**. It leaves out the model file (stored with Git LFS).

---

## 3. Python environment

From the project folder:

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

*On macOS/Linux, activate with `source .venv/bin/activate`, and use `python3` if `python`
is missing.*

**Check:** `python -c "import traci, sumolib; print('SUMO ok')"` should print `SUMO ok`.

---

## 4. Build the web console (once)

```bat
cd frontend
npm install
npm run build
cd ..
```

This creates `frontend/dist`, which the backend serves. Run `npm run build` again whenever
the frontend code changes.

---

## 5. Run it

```bat
.venv\Scripts\activate
cd backend
python server.py
```

Open **http://localhost:8000** in Chrome. The home page explains the project; **Open the
console** goes to the live system. To run a simulation: **Simulation Settings** → choose a
scenario → **Start**.

Leave the terminal open; closing it (or Ctrl+C) stops the console.

**Optional check:** with the virtual environment active, run `pytest tests -q` from the
project folder. It needs no SUMO, and every test should pass.

---

## 6. *(Optional)* The physical model

An ESP32 drives four LED signal heads over USB. They mirror the junction live.

1. **Plug the ESP32 in.** It needs the control sketch `firmware/signal_link/signal_link.ino`
   uploaded once (see `firmware/README.md`). A board that already has it needs nothing more,
   because it keeps the sketch when unplugged.
2. **Start the console** as in step 5. It finds the board automatically. In
   `backend/config.py`, `HARDWARE_SERIAL_PORT = None` means auto-detect; set e.g. `"COM4"`
   to force a port.
3. **Check the footer** at the bottom right of any console page: it should say
   **● Physical model connected (COMx)**.
4. **If the model and screen aren't exactly in step,** adjust `HARDWARE_DELAY_SECONDS` in
   `backend/config.py` (0.5 by default): raise it if the model changes first, lower it if
   the screen does.

Keep the Arduino IDE closed while the console runs; it holds the USB port. A step-by-step
fault ladder is at the end of `firmware/README.md`.

---

## 7. Best graphics on a laptop with a graphics card

- **Chrome:** Settings → System → **"Use graphics acceleration when available"** on.
- **Windows:** Settings → System → Display → Graphics → add **Chrome** → **High
  performance**. On two-GPU laptops, Chrome otherwise often runs on the weaker built-in one.

On slower machines the home page lowers its own quality after a couple of seconds. The
console pages are light.

---

## For developers

- **Frontend dev server:** run `npm run dev` in `frontend/` and open http://localhost:5173.
  It reloads as you edit and talks to the backend on port 8000, so keep `python server.py`
  running. For demos, use the built console on port 8000 instead.
- **Lint and tests:** `npm run lint` and `npx vitest run` in `frontend/`; `pytest tests -q`
  from the project folder.
- **Where to read next:** `README.md` (what the system is, the results, the commands),
  `PROJECT_ARCHITECTURE_REPORT.md` (design history; read its highest-numbered section
  first), and `docs/DEMO_DAY.md` (a one-page demo checklist).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `'python' is not recognized` | Reinstall Python with "Add to PATH" ticked, then open a new terminal. |
| `No module named traci` | Activate `.venv`, then `pip install -r requirements.txt` again. |
| A run fails to start with a SUMO error | SUMO isn't installed, or `SUMO_HOME` isn't set. Fix it, then open a new terminal. |
| The page says **"No frontend build found"** | Run step 4. |
| The Prediction panel stays empty | The model file is only an LFS pointer: `git lfs pull` (step 2's size check). |
| PowerShell refuses `.venv\Scripts\activate` | Use Command Prompt instead, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. |
| Footer: **Physical model not connected** | Check the cable; close the Arduino IDE. Then try forcing the port in `backend/config.py`. |
| Port 8000 already in use | Another console is still running. Close it (or its terminal) first. |
