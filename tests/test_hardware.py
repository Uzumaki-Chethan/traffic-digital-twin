"""
The physical rig's backend side (backend/hardware): the lamp logic that
turns the live signal state into the 16 LEDs, and the USB link that sends
it. The lamp logic must match the 3D view's mast heads exactly
(overview/Junction3D.tsx, Section 36); the link must never block or break
the simulation, whatever the cable does.
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from hardware.lamps import HEAD_ORDER, frame_for, head_lamps  # noqa: E402
from hardware.serial_link import SignalLink  # noqa: E402


def lanes(n="rrr", s="rrr", e="rrr", w="rrr"):
    """Per-lane signal characters, [left, straight, right] per approach."""
    out = {}
    for approach, chars in (("N", n), ("S", s), ("E", e), ("W", w)):
        for i, ch in enumerate(chars):
            out["{}_in_{}".format(approach, i)] = ch
    return out


# ---------------------------------------------------------------- lamps

def test_head_order_is_the_owners_wiring():
    # Head 1..4 on GPIO 13 / 4 / 16 / 17 = South, East, North, West
    assert HEAD_ORDER == ("S", "E", "N", "W")


def test_waiting_approach_shows_only_the_red_circle():
    assert head_lamps(lanes(), "N") == ("R", "0", "0", "0")


def test_green_left_and_straight_light_the_combined_arrow_and_right_arrow_keeps_its_own_colour():
    assert head_lamps(lanes(n="GGr"), "N") == ("0", "0", "G", "R")
    assert head_lamps(lanes(n="rrG"), "N") == ("0", "0", "R", "G")


def test_the_approachs_last_green_ending_shows_the_amber_circle():
    # nothing green any more, something amber: arrows dark, amber circle
    assert head_lamps(lanes(n="yyr"), "N") == ("0", "A", "0", "0")


def test_amber_on_one_arrow_while_the_other_is_still_green():
    assert head_lamps(lanes(n="GGy"), "N") == ("0", "0", "G", "A")


def test_lowercase_green_and_unknown_characters():
    # 'g' is a permissive green; 'o'/'O' (off/blinking) and missing lanes are off
    assert head_lamps(lanes(n="ggr"), "N") == ("0", "0", "G", "R")
    assert head_lamps({}, "N") == ("0", "0", "0", "0")


def test_frame_is_L_then_16_chars_in_head_order():
    f = frame_for(lanes(s="GGr", e="rrr", n="yyr", w="rrG"))
    assert f == "L" + "00GR" + "R000" + "0A00" + "00RG"
    assert len(f) == 17


# ---------------------------------------------------------------- link

class FakePort:
    """A stand-in serial port: records writes, can be made to fail."""

    def __init__(self):
        self.written = []
        self.fail = False
        self.closed = False

    def write(self, data):
        if self.fail:
            raise OSError("cable pulled")
        self.written.append(data.decode())
        return len(data)

    def flush(self):
        pass

    def close(self):
        self.closed = True


def wait_until(cond, timeout=2.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.01)
    return False


def test_link_sends_new_frames_and_never_blocks():
    port = FakePort()
    link = SignalLink(opener=lambda: port, heartbeat_seconds=0.2, retry_seconds=0.05)
    try:
        t0 = time.perf_counter()
        link.publish(lanes(s="GGr"))
        assert time.perf_counter() - t0 < 0.01  # publish only stores the frame
        assert wait_until(lambda: any(w.startswith("L00GR") for w in port.written))
        # the same frame is repeated as a heartbeat while nothing changes
        n = len(port.written)
        assert wait_until(lambda: len(port.written) > n)
        assert port.written[-1] == "L00GRR000R000R000\n"
    finally:
        link.close()


def test_link_reconnects_after_the_cable_is_pulled():
    ports = [FakePort(), FakePort()]
    opened = []

    def opener():
        p = ports[len(opened)]
        opened.append(p)
        return p

    link = SignalLink(opener=opener, heartbeat_seconds=0.05, retry_seconds=0.05)
    try:
        link.publish(lanes())
        assert wait_until(lambda: len(ports[0].written) > 0)
        ports[0].fail = True
        assert wait_until(lambda: len(opened) == 2 and len(ports[1].written) > 0)
        assert ports[0].closed
    finally:
        link.close()


def test_link_without_hardware_is_silent_and_harmless():
    def opener():
        raise OSError("no such port")

    link = SignalLink(opener=opener, heartbeat_seconds=0.05, retry_seconds=0.05)
    try:
        link.publish(lanes())  # must not raise
        time.sleep(0.2)
        assert link.connected is False
    finally:
        link.close()


def test_idle_tells_the_rig_the_run_is_over():
    port = FakePort()
    link = SignalLink(opener=lambda: port, heartbeat_seconds=0.05, retry_seconds=0.05)
    try:
        link.publish(lanes(s="GGr"))
        assert wait_until(lambda: len(port.written) > 0)
        link.idle()
        assert wait_until(lambda: port.written and port.written[-1] == "I\n")
    finally:
        link.close()


# ---------------------------------------------------------------- status for the console

def test_status_reports_disabled_before_any_link_exists(monkeypatch):
    import hardware.serial_link as sl

    monkeypatch.setattr(sl, "_link", None)
    assert sl.link_status() == {"enabled": False, "connected": False, "port": None}


def test_status_reports_a_live_link_and_its_port(monkeypatch):
    import hardware.serial_link as sl

    class Fake:
        connected = True
        port_name = "COM5"

    monkeypatch.setattr(sl, "_link", Fake())
    assert sl.link_status() == {"enabled": True, "connected": True, "port": "COM5"}


def test_status_reports_a_disabled_rig(monkeypatch):
    import hardware.serial_link as sl

    monkeypatch.setattr(sl, "_link", sl._NoLink())
    assert sl.link_status() == {"enabled": False, "connected": False, "port": None}
