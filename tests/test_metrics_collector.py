"""
test_metrics_collector.py
==========================
Offline tests for Performance Evaluation's MetricsCollector - specifically
that a vehicle's SCHEDULED stop time (a <stop> element in its route, e.g.
the accident scenario's stalled truck) is kept out of its travel time,
the way SUMO's own waiting-time accounting keeps it out of delay.

Run from backend/:  pytest ../tests/test_metrics_collector.py
"""

import sys
from pathlib import Path
from types import MappingProxyType

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest

from models import SignalState, SimulationState, VehicleState
from performance.metrics_collector import MetricsCollector


def _state(t: float, vehicles=()):
    signal = SignalState(
        tls_id="C", raw_state="G", current_phase_index=0,
        seconds_until_next_switch=10.0, lane_states=MappingProxyType({}),
        seconds_in_current_phase=t,
    )
    return SimulationState(simulation_time=t, vehicles=list(vehicles), signal=signal)


def _veh(vid, speed=5.0):
    return VehicleState(id=vid, lane_id="E_in_1", speed=speed, waiting_time=0.0,
                        position=(0.0, 0.0), type_id="truck")


def test_travel_time_excludes_scheduled_stop():
    m = MetricsCollector()
    m.record(_state(0.0, [_veh("truck")]), departed_vehicle_ids=["truck"])
    m.record(_state(10.0, [_veh("truck", 0.0)]), stop_starting_vehicle_ids=["truck"])
    m.record(_state(60.0, [_veh("truck")]), stop_ending_vehicle_ids=["truck"])
    m.record(_state(70.0, []), arrived_vehicle_ids=["truck"])
    s = m.summary()
    # 70 s gross, 50 s of it a scheduled stop -> 20 s of travel
    assert s["max_travel_time_seconds"] == pytest.approx(20.0)
    assert s["avg_travel_time_seconds"] == pytest.approx(20.0)


def test_travel_time_unchanged_without_stop_lists():
    m = MetricsCollector()
    m.record(_state(0.0, [_veh("car")]), departed_vehicle_ids=["car"])
    m.record(_state(70.0, []), arrived_vehicle_ids=["car"])
    assert m.summary()["max_travel_time_seconds"] == pytest.approx(70.0)


def test_scheduled_stop_never_goes_negative_or_leaks_between_vehicles():
    m = MetricsCollector()
    m.record(_state(0.0, [_veh("a"), _veh("b")]), departed_vehicle_ids=["a", "b"])
    # 'b' ends a stop it never (observably) started: ignored, not negative.
    m.record(_state(5.0, [_veh("a"), _veh("b")]), stop_ending_vehicle_ids=["b"])
    m.record(_state(10.0, [_veh("a"), _veh("b")]), stop_starting_vehicle_ids=["a"])
    m.record(_state(40.0, [_veh("a"), _veh("b")]), stop_ending_vehicle_ids=["a"])
    m.record(_state(50.0, []), arrived_vehicle_ids=["a", "b"])
    s = m.summary()
    assert s["max_travel_time_seconds"] == pytest.approx(50.0)   # b: no stop credited
    assert s["avg_travel_time_seconds"] == pytest.approx((20.0 + 50.0) / 2)
