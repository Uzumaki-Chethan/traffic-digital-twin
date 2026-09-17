"""
test_evaluation_gate.py
========================
The pieces performance/evaluator.py gained for running under the console
(2026-09-14): the RunControl gate its lockstep loop honours, and the
two-sided live snapshot it publishes. Both are pure; no SUMO.

Run from backend/:  pytest ../tests/test_evaluation_gate.py
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from performance.evaluator import evaluation_snapshot, lockstep_gate, pace_after_step
from services.run_control import RunControl


def test_gate_stops_when_stop_requested():
    c = RunControl()
    c.request_stop()
    assert lockstep_gate(c) is False


def test_gate_continues_when_running():
    c = RunControl(speed=None)
    assert lockstep_gate(c) is True


def test_gate_and_pacing_without_control_are_noops():
    assert lockstep_gate(None) is True
    pace_after_step(None, 0.05)  # must not raise


def test_pacing_uses_the_control_when_given():
    c = RunControl(speed=None)  # unthrottled: returns immediately
    pace_after_step(c, 0.05)


def test_evaluation_snapshot_shape():
    side = {"signal": None, "metrics": {}, "lanes": [], "vehicles": [], "decision": {}, "phase_history": []}
    rows = [{"key": "avg_waiting_time_seconds", "label": "Avg Waiting Time (s)", "ai": 1.0, "baseline": 2.0, "improvement": 50.0}]
    snap = evaluation_snapshot("light_seed1", "vac", 12.0, side, side, rows, final=False)
    assert set(snap) == {"kind", "tick", "sim_time", "scenario", "baseline_controller", "ai", "baseline", "comparison"}
    assert snap["tick"] is True
    assert snap["kind"] == "evaluation" and snap["scenario"] == "light_seed1"
    assert snap["baseline_controller"] == "vac" and snap["sim_time"] == 12.0
    assert snap["comparison"] == {"rows": rows, "final": False}
    assert evaluation_snapshot("x", "vac", 1.0, side, side, rows, final=True)["comparison"]["final"] is True
