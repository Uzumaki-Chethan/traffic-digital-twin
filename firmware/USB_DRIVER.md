# When Windows doesn't recognise the ESP32

The console talks to the physical model through the ESP32's **USB-to-serial chip**. On our
board that is a **Silicon Labs CP210x** (USB vendor ID `10C4`). Windows needs that chip's
driver before the board appears as a COM port. Usually Windows installs it by itself the
first time the board is plugged in. When it doesn't, follow this page.

---

## 1. Look at what Windows sees

Plug the ESP32 in, then open **Device Manager**: right-click the Start button → Device
Manager. Find your case in this table:

| What you see | Meaning | Go to |
|---|---|---|
| **Ports (COM & LPT) → "Silicon Labs CP210x USB to UART Bridge (COM3)"** (any number) | The driver is installed and the board is ready. | Nothing to fix: note the COM number. |
| **Other devices → "CP2102 USB to UART Bridge Controller"**, or **Unknown device**, with a yellow ⚠ | Windows sees the board but has no driver. | Step 2 |
| A **"USB-SERIAL CH340"** device, or an unknown device mentioning CH340 | A board with the other common chip (WCH CH340). | Step 4 |
| **Nothing appears or changes** when you plug the board in | No data connection at all. | Step 5 |

**Tip:** if you can't tell which device is the board, watch Device Manager while you unplug
it and plug it back in. The entry that disappears and reappears is the board.

---

## 2. Install the Silicon Labs CP210x driver

1. Go to **silabs.com**, search for **"CP210x USB to UART Bridge VCP Drivers"**, and open
   that page (Silicon Labs' developer tools → USB to UART Bridge VCP Drivers).
2. Under **Downloads**, get **"CP210x Universal Windows Driver"**. It's a `.zip`.
3. **Extract the zip:** right-click → *Extract All…*. Don't run anything from inside the
   zip; Windows can't install drivers from a zip.
4. Install it, in **either** of these ways:
   - **(a)** In the extracted folder, right-click **`silabser.inf`** → **Install**, and allow
     the prompt.
   - **(b)** In **Device Manager**, right-click the board's entry (the one with ⚠) →
     **Update driver** → **Browse my computer for drivers** → choose the **extracted folder**
     → **Next**.
5. **Unplug the board, wait 3 seconds, and plug it back in.**

Device Manager should now show **Ports (COM & LPT) → Silicon Labs CP210x USB to UART Bridge
(COMx)**.

> **Older Windows, or if the above refuses:** on the same Silicon Labs page, the
> **"CP210x Windows Drivers"** download has an installer. Run **`CP210xVCPInstaller_x64.exe`**
> (64-bit Windows; `_x86` for 32-bit), then unplug and replug the board.

> **No internet on the laptop?** Download the zip on another computer and bring it over on
> a pen drive. The driver works offline.

---

## 3. Check that it works

1. **Note the COM number** from Device Manager (for example `COM3`).
2. **List the ports** from the project folder:
   ```bat
   .venv\Scripts\activate
   cd backend
   python -m hardware.rig_test --list
   ```
   The board's port should be listed.
3. **Light the heads:** run `python -m hardware.rig_test`. They cycle through their lights.
   Press Ctrl+C to stop.
4. **Start the console:** run `python server.py`. The footer should say **Physical model
   connected (COMx)**.

The console finds the board by itself (`HARDWARE_SERIAL_PORT = None` in
`backend\config.py`). If it doesn't, put the number there, e.g.
`HARDWARE_SERIAL_PORT = "COM3"`, and restart `python server.py`.

---

## 4. A board with a CH340 chip instead

Some ESP32 boards use the **WCH CH340 / CH9102** chip instead of the CP210x. Its driver comes
from the chip maker, WCH (search **"CH341SER driver"** on **wch-ic.com**). Download, run the
installer, click **Install**, then unplug and replug the board. It shows up as
**"USB-SERIAL CH340 (COMx)"**.

The console recognises this chip too; nothing else changes.

---

## 5. Nothing appears at all

This is almost never the driver; it's the connection.

- **Try another USB cable.** Many micro-USB / USB-C cables are **charge-only** and have no
  data wires. This is the most common cause. Use one that has transferred files from a
  phone before.
- **Try another USB port** on the laptop, directly rather than through a hub or dock.
- **Check that the board gets power:** its small red power LED should be on. The signal
  heads do a quick colour sweep when the board starts, if the control sketch is on it.
- **Restart the laptop** once, after installing a driver.

---

## 6. It shows a COM port, but the console can't open it

| Message | Fix |
|---|---|
| "Access is denied" / "could not open port" / "port busy" | Something else has the port. **Close the Arduino IDE** (especially its Serial Monitor) and any running `rig_test`. Only one program can hold a COM port at a time. |
| The footer says **not connected**, but the port is listed | Set the port explicitly in `backend\config.py` (step 3), then restart `python server.py`. |
| The COM number changed | Windows gives a number per USB socket. Use the same socket each time, or keep `HARDWARE_SERIAL_PORT = None` so the console finds it wherever it is. |

---

## Good to know

- **No Arduino IDE needed to run the model.** The control sketch (`signal_link.ino`) stays
  saved on the ESP32 when it's unplugged. The driver is the only thing a new laptop may need.
- **Install the driver once per laptop.** After that, the board appears every time it's
  plugged in.
- **More steps:** the full fault ladder, covering wiring, colours and pins, is at the end of
  [`README.md`](README.md) in this folder.
