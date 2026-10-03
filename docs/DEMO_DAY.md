# Demo day — one page

Everything in order, from a cold laptop to a running demo with the physical model.
Wiring and flashing the board are in `firmware/README.md`; this page assumes the
board already runs the `signal_link` sketch.

## The night before

1. **Build the frontend:** run `npm run build` in `frontend/`. The console then serves the
   built app, and you need no `npm run dev` on the day.
2. **Test the lamps without a simulation:** with the board plugged in, run
   `python -m hardware.rig_test` from `backend/`.
   - All 16 lamps should cycle through red, amber and green on every head.
   - If it can't find the board: run `python -m hardware.rig_test --list`, then
     `python -m hardware.rig_test --port COM3` (use the port the list shows).
   - **Close it afterwards** (Ctrl+C). It holds the USB port while it runs.
3. **Close the Arduino IDE's Serial Monitor.** It holds the port too.

## On the day

1. **Plug the board in by USB.**
2. **Start the console:** run `python server.py` from `backend/`. Leave this window open
   for the whole demo.
3. **Open the console:** go to `http://localhost:8000` in Chrome, full-screen with F11.
   The home page opens first.
4. **Check the footer:** at the bottom right of any console page, wait for
   **● Physical model connected (COMx)** in green. Red ("not connected") means the board
   isn't answering; see the table below.
5. **Start everything from Simulation Settings:**
   - Set **Choose for** to **Overview · demo** (Trinetra alone) or **Performance · Trinetra vs VAC**
     (Trinetra against the vehicle-actuated signal).
   - Click a scenario card, then press **Start** in the top bar.
   - It starts that scenario and takes you to Overview or Performance by itself.
   - The four signal heads on the model follow the junction on screen, five times a
     second.

## Suggested running order

| Show | Where | Why |
|---|---|---|
| The home page, scrolled slowly | `/` | The whole story in two minutes; ends on "Open the console". |
| **Normal day**, speed 2× | Settings → Choose for *Overview* → Normal day → Start | Busiest everyday case; Trinetra's biggest win (86 % less waiting). |
| Send an **ambulance** mid-run | Overview top bar → Dispatch | The emergency green, live, on screen and on the model. |
| **Heavy traffic**, Trinetra vs VAC | Settings → Choose for *Performance* → Heavy traffic → Start (it stops the demo first) | Two junctions side by side, seven measures scored live. |
| Why it chose each green | Decisions | Every decision, with its reasons. |

## If something goes wrong

| What you see | What to do |
|---|---|
| Footer says **Physical model not connected** | Check the USB cable. Close `rig_test` and the Arduino Serial Monitor. It reconnects by itself within ~2 s; nothing needs restarting. |
| Every head **blinks amber** | The board lost the link (cable, or the console closed). Same as above. The simulation is unaffected. |
| Lamps on the model don't match the screen | Head order is South, East, North, West on GPIO 13 / 4 / 16 / 17. Check which chain is in which socket. |
| Home page feels slow | It lowers its own quality after ~2 s on a slow machine. Or go straight to `http://localhost:8000/overview`. |
| A page shows "no data" | Nothing is running: go to Simulation Settings and press **Start**. |
| The console window was closed | Run `python server.py` again and reload the browser. |

## Revert point

If anything breaks after a last-minute change, `git checkout prototype-4` is the state
that was demo-ready on 2026-10-03.
