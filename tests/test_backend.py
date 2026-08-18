"""
test_backend.py
================
Smoke tests for the core, TraCI-independent pieces of the pipeline:
DigitalTwin and the raw state models it stores.

The previous version of this file tested a Flask `/health` and `/`
endpoint via `app.test_client()`. That doesn't match this project's
actual architecture: backend/app.py is a console entry point that runs
a TraCIManager loop (see its `main()` function), not a Flask app, so
there is no `app` object to import or test_client() to create. These
tests exercise what can actually be tested without a live SUMO/TraCI
connection.

Run from the `backend/` directory (or with `backend/` on PYTHONPATH),
matching how the rest of the backend package imports itself, e.g.:
    cd backend && pytest ../tests/test_backend.py
"""

import sys
from pathlib import Path

# backend/ modules import each other directly (e.g. `from models import ...`,
# not `from backend.models import ...`), so backend/ must be on sys.path,
# the same way app.py expects to be run.
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest

from digital_twin import DigitalTwin
from models import SimulationState, VehicleState, SignalState


def _make_state(sim_time: float, vehicle_count: int = 1) -> SimulationState:
    vehicles = [
        VehicleState(
            id=f"veh_{i}",
            lane_id="N_in_0",
            speed=5.0,
            waiting_time=0.0,
            position=(0.0, 0.0),
        )
        for i in range(vehicle_count)
    ]
    signal = SignalState(
        tls_id="junction1",
        raw_state="GrGr",
        current_phase_index=0,
        seconds_until_next_switch=10.0,
        lane_states={"N_in_0": "G"},
    )
    return SimulationState(simulation_time=sim_time, vehicles=vehicles, signal=signal)


def test_digital_twin_starts_empty():
    twin = DigitalTwin()
    assert twin.current_state is None
    assert twin.history == ()


def test_digital_twin_update_sets_current_state():
    twin = DigitalTwin()
    state = _make_state(sim_time=1.0)

    twin.update(state)

    assert twin.current_state is state
    assert twin.history == ()


def test_digital_twin_moves_previous_state_into_history():
    twin = DigitalTwin()
    first = _make_state(sim_time=1.0)
    second = _make_state(sim_time=2.0)

    twin.update(first)
    twin.update(second)

    assert twin.current_state is second
    assert twin.history == (first,)


def test_digital_twin_rejects_wrong_type():
    twin = DigitalTwin()
    with pytest.raises(TypeError):
        twin.update("not a SimulationState")


def test_digital_twin_history_is_bounded():
    twin = DigitalTwin(history_size=2)
    for i in range(5):
        twin.update(_make_state(sim_time=float(i)))

    # Only the 2 most recent superseded states should remain.
    assert len(twin.history) == 2
    assert [s.simulation_time for s in twin.history] == [2.0, 3.0]