"""
What each physical signal head shows, from the live per-lane signal state.

This mirrors the 3D view's mast heads exactly (frontend overview/
Junction3D.tsx, PROJECT_ARCHITECTURE_REPORT.md Section 36) — the hardware
is built to match them:

  lens 1  red circle      shared by the whole approach
  lens 2  amber circle    shared by the whole approach
  lens 3  combined arrow  left + ahead (they always run in the same phase)
  lens 4  right arrow     the right turn's own colour

While anything on the approach is green, both arrows carry their own
movement's colour and the circles are dark. Once nothing is green, the
arrows go dark and ONE circle says it: amber if the approach's last green
just ended (something still amber), otherwise red.

Lanes are `<approach>_in_<n>`: 0 = left, 1 = straight, 2 = right.
"""
from typing import Dict, Mapping, Tuple

# Head 1..4, wired to GPIO 13 / 4 / 16 / 17 (firmware/signal_link), stand
# for these approaches — the owner's choice, 2026-10-02.
HEAD_ORDER: Tuple[str, ...] = ("S", "E", "N", "W")

OFF, RED, AMBER, GREEN = "0", "R", "A", "G"
_RANK = {GREEN: 2, AMBER: 1, RED: 0, OFF: -1}


def lamp_of(ch: str) -> str:
    """One SUMO signal character -> R / A / G / 0 (as utils/signal.lampOf does)."""
    if ch in ("G", "g"):
        return GREEN
    if ch in ("y", "Y", "u"):
        return AMBER
    if ch in ("r", "R", "s"):
        return RED
    return OFF


def head_lamps(lane_states: Mapping[str, str], approach: str) -> Tuple[str, str, str, str]:
    """The four lenses of one approach's head: (red, amber, combined arrow, right arrow)."""
    left, straight, right = (lamp_of(lane_states.get("{}_in_{}".format(approach, i), "")) for i in range(3))
    if left == OFF and straight == OFF and right == OFF:
        return (OFF, OFF, OFF, OFF)
    lamps = (left, straight, right)
    if GREEN not in lamps:
        return (OFF, AMBER, OFF, OFF) if AMBER in lamps else (RED, OFF, OFF, OFF)
    # left and straight always share a phase; take the more active one
    combined = left if _RANK[left] >= _RANK[straight] else straight
    return (OFF, OFF, combined, right)


def frame_for(lane_states: Mapping[str, str]) -> str:
    """The serial line for all 16 lenses: 'L' + 4 chars per head, in HEAD_ORDER."""
    return "L" + "".join("".join(head_lamps(lane_states, a)) for a in HEAD_ORDER)


def lamps_by_approach(lane_states: Mapping[str, str]) -> Dict[str, Tuple[str, str, str, str]]:
    """For logs and status: approach -> its four lenses."""
    return {a: head_lamps(lane_states, a) for a in HEAD_ORDER}
