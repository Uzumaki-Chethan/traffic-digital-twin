# Physical rig — what to do, in order

The rig is junction C in acrylic: four signal heads (4 LEDs each, 16 in all) on an ESP32,
driven live by the AI's simulation over one USB cable. Wiring details are in
`TRINETRA_Hardware_Wiring_Handoff.pdf`; the software side is
PROJECT_ARCHITECTURE_REPORT.md Section 43.

| Head | ESP32 pin | Approach |
|---|---|---|
| Head 1 | GPIO 13 | **South** |
| Head 2 | GPIO 4 | **East** |
| Head 3 | GPIO 16 | **North** |
| Head 4 | GPIO 17 | **West** |

Lenses on every head, in chain order:
1. red circle;
2. amber circle;
3. combined left + ahead arrow;
4. right arrow.

## 1. Wire and bench-test each head (the handoff PDF)

1. Wire Head 1. Flash `bench_test/bench_test.ino` with `HEADS_WIRED 1`. Each lens should
   go red, amber, green, in order 1 to 4.
2. Wire Heads 2, 3 and 4 the same way, raising `HEADS_WIRED` each time.

**If something is wrong:**
- **Nothing lights:** check GND first (the ESP32 and the LEDs must share it), then the
  arrow direction on the strip, then the pin.
- **Wrong or flickery colours:** add the 1N4001 diode in the 5 V line (PDF §2.4).

## 2. Flash the live sketch

1. Open `signal_link/signal_link.ino` in the Arduino IDE.
2. Leave `HEADS_WIRED 4`, select Board "ESP32 Dev Module" and the COM port, and Upload.
   It compiles cleanly as of 2026-10-02.
3. On power-up it sweeps every lens (red, amber, green), then **all amber circles blink
   slowly**. That means it is waiting for the computer, which is correct.

## 3. Test the link without a simulation

From `backend/`, with the board plugged in:

```
python -m hardware.rig_test             # finds the ESP32 by itself
python -m hardware.rig_test --list      # if not: see the ports...
python -m hardware.rig_test --port COM3 # ...and name it
```

It walks the junction clockwise from South: left+straight green, amber, right turn green,
amber, with every other head on its red circle. Each step is printed, so you can check each
head matches the printed line. Ctrl+C ends it and the rig goes idle.

**If a head looks wrong:**
- **Shows another head's lights:** its data wire is on the wrong pin.
- **Lenses in the wrong order:** the strip runs backwards, or the lenses are in the wrong
  holes.

## 4. The real thing

1. Close `rig_test`. It holds the COM port, and so does the Arduino IDE's Serial Monitor,
   so close that too.
2. Run `python server.py`. The rig switches to **all red circles steady** (idle).
3. Press **Start** in the browser. The heads now follow the AI exactly as the 3D view's
   mast heads do.
4. During a Performance evaluation, the rig shows the Trinetra side.

**What the rig shows:**

| Rig shows | Meaning |
|---|---|
| quick colour sweep | just powered on |
| amber circles blinking | no computer talking to it (console closed, cable out, or not started yet) |
| red circles steady | console running, no simulation |
| live lights | following the simulation |

**If it stays amber-blinking:**
- check that the console is running (`python server.py`);
- check the console log for "Physical rig connected" or "not connected";
- check that nothing else has the port open (Arduino Serial Monitor, `rig_test`).

**Other things to know:**
- **Cable pulled and put back:** the backend reconnects by itself within about 2 s.
- **Not the ESP32's usual COM port:** set `HARDWARE_SERIAL_PORT = "COM5"` (for example) in
  `backend/config.py`.
- **Switch the rig off in software:** set `HARDWARE_ENABLED = False` there.

## When it isn't working: find the step that fails

**Windows doesn't show the board as a COM port?** See [`USB_DRIVER.md`](USB_DRIVER.md) (installing the Silicon Labs CP210x driver).

Work down this ladder. Stop at the first step that fails; the fix is in that row.

| # | Do this | You should see | If not |
|---|---|---|---|
| 1 | Plug the ESP32 in by USB, open Device Manager → Ports (COM & LPT) | A "Silicon Labs CP210x" or "USB-SERIAL CH340" COM port | Install that chip's driver; try another cable (many USB cables are charge-only) |
| 2 | Upload `bench_test/bench_test.ino`, power the pixels | Each head's 4 lenses light in turn | **Wiring/power**, see the list below |
| 3 | Upload `signal_link/signal_link.ino` | Power-on colour sweep, then the amber circles blink | Re-check `HEADS_WIRED` (top of the sketch) is `4` |
| 4 | Watch the sweep's colours | Red lens red, green lens green | Red and green swapped → set `PIXEL_ORDER` to `NEO_RGB` and re-upload. Lights dark or flicker with good wiring → try `PIXEL_SPEED NEO_KHZ400` |
| 5 | **Close the Arduino IDE's Serial Monitor**, then `python -m hardware.rig_test` (from `backend/`) | All 16 lamps cycle | "no ESP32 serial port found" → `python -m hardware.rig_test --list`, then `--port COM5` (your number). "Access denied" → something else holds the port: close Arduino IDE / another `rig_test` |
| 6 | Ctrl+C `rig_test`, run `python server.py` | Red circles steady; footer says **Physical model connected (COMx)** | If `--port` was needed in step 5, put the same port in `backend/config.py`: `HARDWARE_SERIAL_PORT = "COM5"` |
| 7 | Start a run (Simulation Settings → Start) | Heads follow the screen | Heads in the wrong places → the chains are in the wrong pins: South 13, East 4, North 16, West 17 |

**Wiring/power checklist (step 2):**
- **Shared ground:** the pixel power supply's GND must be wired to the ESP32's GND. Without
  it, nothing lights or the colours are random. This is the most common fault.
- **Data direction:** WS2811 chains have an arrow or "DIN" side; the ESP32 wire must go to
  DIN, not DOUT.
- **The 470 Ω resistor** sits in series on each data wire, close to the first pixel.
- **The power supply's voltage** must match the pixels (5 V or 12 V; check the strip) and
  give enough current. Never power 12 V pixels from the ESP32's 5 V pin.
- **Data level:** the ESP32 sends 3.3 V data. Most pixels accept it over a short wire. If
  they don't, shorten the data wire, or add a 74AHCT125 level shifter.
- **Pins:** the data wire must be on the right GPIO number (13, 4, 16, 17), labelled on the
  board as D13, D4, RX2/16, TX2/17.
