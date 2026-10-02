"""
Drive the physical rig WITHOUT a simulation, to check the wiring and the
firmware over the real USB link (run from backend/):

    python -m hardware.rig_test              # find the ESP32 automatically
    python -m hardware.rig_test --port COM3  # or name the port
    python -m hardware.rig_test --list       # show the serial ports

It walks the junction clockwise from South (the head order on the board):
each approach gets its left+straight green, then amber, then its right turn
green, then amber, while every other head shows its red circle — exactly
what the AI's run will look like, phase by phase. Each step is printed, so
you can check every head shows what the line says. Ctrl+C ends it and puts
the rig into its idle pattern.
"""
import argparse
import sys
import time

from hardware.lamps import HEAD_ORDER, lamps_by_approach
from hardware.serial_link import SignalLink, find_port

NAMES = {"N": "North", "S": "South", "E": "East", "W": "West"}
LENS = ("red circle", "amber circle", "left+ahead arrow", "right arrow")


def lanes_for(active: str, left_straight: str, right: str) -> dict:
    out = {}
    for a in "NSEW":
        chars = (left_straight, left_straight, right) if a == active else ("r", "r", "r")
        for i, ch in enumerate(chars):
            out["{}_in_{}".format(a, i)] = ch
    return out


STEPS = [
    ("left + straight GREEN", "G", "r", 3.0),
    ("left + straight AMBER", "y", "r", 1.5),
    ("right turn GREEN", "r", "G", 2.5),
    ("right turn AMBER", "r", "y", 1.5),
]


def describe(lanes: dict) -> str:
    parts = []
    for a, lamps in lamps_by_approach(lanes).items():
        lit = [f"{LENS[i]} {'RED' if c == 'R' else 'AMBER' if c == 'A' else 'GREEN'}" for i, c in enumerate(lamps) if c != "0"]
        parts.append(f"{NAMES[a]}: {', '.join(lit) or 'dark'}")
    return " | ".join(parts)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", help="serial port, e.g. COM3 (default: find the ESP32)")
    ap.add_argument("--list", action="store_true", help="list serial ports and exit")
    ap.add_argument("--loops", type=int, default=0, help="stop after N full cycles (0 = forever)")
    args = ap.parse_args()

    from serial.tools import list_ports

    if args.list:
        for p in list_ports.comports():
            print(f"{p.device}  vid={p.vid!r}  {p.description}")
        return 0
    try:
        port = find_port(args.port)
    except OSError as exc:
        print(f"Can't find the board: {exc}. Try --list, then --port COMx.")
        return 1
    print(f"Using {port}. Head order on the board: " + ", ".join(f"Head {i + 1} = {NAMES[a]}" for i, a in enumerate(HEAD_ORDER)))
    link = SignalLink(port=port, heartbeat_seconds=0.5, retry_seconds=1.0)
    loops = 0
    try:
        time.sleep(1.0)
        while args.loops == 0 or loops < args.loops:
            for a in HEAD_ORDER:
                for label, ls, r, secs in STEPS:
                    lanes = lanes_for(a, ls, r)
                    link.publish(lanes)
                    state = "connected" if link.connected else "NOT connected"
                    print(f"[{state}] {NAMES[a]} {label}:  {describe(lanes)}")
                    time.sleep(secs)
            loops += 1
    except KeyboardInterrupt:
        pass
    finally:
        link.idle()
        time.sleep(0.6)
        link.close()
        print("Rig set to idle.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
