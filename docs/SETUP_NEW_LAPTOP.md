# Setting up Trinetra on a new laptop (Windows)

Everything needed to run the whole project, including the physical model, on a fresh
Windows laptop. It takes about 30–45 minutes, mostly downloads. Do it the day before the
demo, not on the day.

## 1. Install these five things

| What | Where | Notes |
|---|---|---|
| **Git for Windows** | git-scm.com | Includes **Git LFS**, which is needed for the AI model file. Default options are fine. |
| **Python 3.13** | python.org → Downloads | On the first installer screen, **tick "Add python.exe to PATH"**. 3.11 or 3.12 also work. |
| **SUMO 1.27** | eclipse.dev/sumo → Download → Windows installer (64-bit) | Let it **set SUMO_HOME** (the installer offers this). Version 1.27 matches the project's `traci` / `sumolib`. |
| **Node.js 22 LTS** | nodejs.org | Only needed to build the website once. Default options are fine. |
| **CP210x USB driver** | silabs.com → "CP210x USB to UART Bridge VCP Drivers" | Usually installs by itself when the ESP32 is plugged in. Install it if the board doesn't appear in Device Manager. |

**After installing, close and reopen any terminal windows**, so they pick up the new PATH and
SUMO_HOME.

## 2. Get the project (with the model)

Open **Command Prompt** (not PowerShell; that avoids a script-permission prompt in step 3)
and run:

```bat
cd %USERPROFILE%\Desktop
git clone https://github.com/Uzumaki-Chethan/traffic-digital-twin.git
cd traffic-digital-twin
git lfs install
git lfs pull
```

**Check:** `backend\ml\trained_models\random_forest_predictor.joblib` must be about **258 MB**.
If it's under 1 KB, the model didn't download; run `git lfs pull` again.

- **Don't use GitHub's "Download ZIP".** It doesn't include the model file.
- **If GitHub asks you to sign in** (the repository may be private), sign in with the
  owner's GitHub account. Or use the fallback below.

**Fallback, with no internet or no GitHub access:** copy the whole `traffic-digital-twin`
folder from the owner's laptop on a pen drive, **leaving out** `.venv` and
`frontend\node_modules`. Those two only work on the laptop that made them, and steps 3–4
recreate them.

## 3. Install the Python parts

In the same Command Prompt, inside `traffic-digital-twin`:

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**Check:** run `python -c "import traci, sumolib; print('SUMO ok')"`. It should print `SUMO ok`.
If it says "No module named traci", the `pip install` failed; run it again and read the
error.

## 4. Build the website (once)

```bat
cd frontend
npm install
npm run build
cd ..
```

This creates `frontend\dist`, the website the console serves. You only need to do it again
if the frontend code changes.

## 5. The physical model's port

1. Plug in the ESP32 and open **Device Manager → Ports (COM & LPT)**. Note the number next
   to "Silicon Labs CP210x…", for example `COM4`.
2. Open `backend\config.py` and find `HARDWARE_SERIAL_PORT`.
3. Either set it to that number, `HARDWARE_SERIAL_PORT = "COM4"`, or set it to
   `HARDWARE_SERIAL_PORT = None` and the console finds the board by itself.

The sketch is already on the ESP32. **No Arduino IDE needed.**

## 6. Run it

Every time you run it:

```bat
cd %USERPROFILE%\Desktop\traffic-digital-twin
.venv\Scripts\activate
cd backend
python server.py
```

Then open **http://localhost:8000** in Chrome.
- The model's heads go steady red.
- The footer says **Physical model connected (COMx)**.
- To start a demo: Simulation Settings → pick a scenario → **Start**.

Keep the Command Prompt window open the whole time; closing it stops everything. The full
demo-day running order is in `docs/DEMO_DAY.md`.

## 7. For the best graphics on a laptop with a graphics card

- **In Chrome:** go to Settings → System, and make sure **"Use graphics acceleration when
  available"** is on.
- **In Windows:** go to Settings → System → Display → Graphics, add **Chrome**, and choose
  **High performance**. On laptops with two GPUs, Chrome otherwise often runs on the weaker
  built-in one.

## Quick troubleshooting

| Problem | Fix |
|---|---|
| `'python' is not recognized` | Reinstall Python with "Add to PATH" ticked, then open a new Command Prompt. |
| `No module named traci` | `.venv\Scripts\activate`, then `pip install -r requirements.txt` again. |
| Console starts but runs fail with a SUMO error | SUMO isn't installed, or SUMO_HOME isn't set. Reinstall SUMO, letting it set SUMO_HOME, then open a new Command Prompt. |
| The page says "no frontend build found" | Run step 4 (`npm run build` in `frontend`). |
| Footer: **Physical model not connected** | Check the cable and the COM number (step 5). Close the Arduino IDE if it's open. |
| Predictions panel stays empty | The model file didn't download (step 2's 258 MB check): `git lfs pull`. |
