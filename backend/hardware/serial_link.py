"""
The USB serial link to the physical rig's ESP32 (firmware/signal_link).

One background thread owns the port. The simulation only ever calls
`publish()` / `idle()`, which store the newest line and return at once —
a slow, missing or unplugged cable can never stall or break a run. The
thread sends a line as soon as it changes and repeats the current one as a
heartbeat (the firmware falls back to blinking amber if the heartbeat
stops), and reopens the port by itself if the cable is pulled and put back.

Protocol (newline-terminated ASCII, 115200 baud):
  L<16 chars>   the 16 lenses, 4 per head in lamps.HEAD_ORDER, each R/A/G/0
  I             no run: the rig shows its idle pattern

Opening a serial port normally pulses DTR/RTS, which reboots an ESP32 —
both lines are held low before the port opens, and the port is opened
once per process (the console's), not once per run.
"""
import logging
import threading
import time
from typing import Callable, Mapping, Optional

from hardware.lamps import frame_for

logger = logging.getLogger(__name__)

# USB-to-serial chips found on ESP32 DevKit boards.
_ESP32_USB_VIDS = {0x10C4, 0x1A86}  # Silicon Labs CP210x, WCH CH340/CH9102


def find_port(preferred: Optional[str] = None) -> str:
    """The ESP32's COM port: `preferred` if given, else the first CP210x/CH340 found."""
    if preferred:
        return preferred
    from serial.tools import list_ports

    for p in list_ports.comports():
        if p.vid in _ESP32_USB_VIDS:
            return p.device
    raise OSError("no ESP32 serial port found (is the board plugged in?)")


def open_serial(port: Optional[str] = None, baud: int = 115200):
    """Open the board's port without rebooting it (DTR/RTS held low)."""
    import serial

    s = serial.Serial()
    s.port = find_port(port)
    s.baudrate = baud
    s.timeout = 0
    s.write_timeout = 0.5
    s.dtr = False
    s.rts = False
    s.open()
    return s


class SignalLink:
    """Sends the live lamp states to the rig; see the module docstring."""

    def __init__(
        self,
        opener: Optional[Callable[[], object]] = None,
        port: Optional[str] = None,
        baud: int = 115200,
        heartbeat_seconds: float = 1.0,
        retry_seconds: float = 2.0,
    ):
        self._opener = opener or (lambda: open_serial(port, baud))
        self._heartbeat = heartbeat_seconds
        self._retry = retry_seconds
        self._cond = threading.Condition()
        self._pending: Optional[str] = None
        self._stop = False
        self._warned = False
        self.connected = False
        self.port_name: Optional[str] = None
        self._thread = threading.Thread(target=self._run, name="rig-link", daemon=True)
        self._thread.start()

    # ---------------------------------------------------------------- API
    def publish(self, lane_states: Mapping[str, str]) -> None:
        """The light just read from SUMO. Never blocks, never raises."""
        try:
            self._set(frame_for(lane_states))
        except Exception:  # a side-channel: never the reason a tick fails
            logger.debug("Rig frame skipped.", exc_info=True)

    def idle(self) -> None:
        """No run any more: the rig shows its idle pattern."""
        self._set("I")

    def close(self) -> None:
        with self._cond:
            self._stop = True
            self._cond.notify()
        self._thread.join(timeout=2)

    # ---------------------------------------------------------------- thread
    def _set(self, line: str) -> None:
        with self._cond:
            if line != self._pending:
                self._pending = line
                self._cond.notify()

    def _run(self) -> None:
        port = None
        next_try = 0.0
        while True:
            with self._cond:
                if self._stop:
                    break
                self._cond.wait(timeout=self._heartbeat)
                if self._stop:
                    break
                line = self._pending
            if line is None:
                continue
            if port is None:
                if time.monotonic() < next_try:
                    continue
                try:
                    port = self._opener()
                    self.connected = True
                    self.port_name = getattr(port, "port", None)
                    self._warned = False
                    logger.info("Physical rig connected%s.", " on {}".format(self.port_name) if self.port_name else "")
                except Exception as exc:
                    self.connected = False
                    next_try = time.monotonic() + self._retry
                    if not self._warned:
                        logger.info("Physical rig not connected (%s) - will keep trying quietly.", exc)
                        self._warned = True
                    continue
            try:
                port.write((line + "\n").encode("ascii"))
                port.flush()
            except Exception as exc:
                logger.warning("Physical rig link lost (%s) - reconnecting.", exc)
                self._close_port(port)
                port = None
                self.connected = False
                next_try = time.monotonic() + self._retry
        if port is not None:
            try:
                port.write(b"I\n")
                port.flush()
            except Exception:
                pass
            self._close_port(port)
        self.connected = False

    @staticmethod
    def _close_port(port) -> None:
        try:
            port.close()
        except Exception:
            pass


class _NoLink:
    """Stands in when the rig is disabled or pyserial is missing."""

    connected = False
    port_name = None

    def publish(self, lane_states) -> None:
        pass

    def idle(self) -> None:
        pass

    def close(self) -> None:
        pass


_link = None
_link_lock = threading.Lock()


def get_link():
    """The process's one link (the port can only be open once), created on first use."""
    global _link
    with _link_lock:
        if _link is None:
            from config import Config

            if not getattr(Config, "HARDWARE_ENABLED", True):
                _link = _NoLink()
            else:
                try:
                    import serial  # noqa: F401
                except ImportError:
                    logger.info("pyserial not installed - physical rig disabled.")
                    _link = _NoLink()
                else:
                    _link = SignalLink(port=getattr(Config, "HARDWARE_SERIAL_PORT", None), baud=getattr(Config, "HARDWARE_BAUD", 115200))
        return _link
