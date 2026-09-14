"""
test_snapshot_views.py
=======================
The dashboard snapshot view builders (backend/services/snapshot_views.py)
are pure functions over the raw state / features / decision objects, so a
demo run and each side of an evaluation produce identical shapes from one
implementation. No SUMO.

Run from backend/:  pytest ../tests/test_snapshot_views.py
"""

import sys
from pathlib import Path
from types import MappingProxyType, SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from decision_engine.decision_engine import ALL_APPROACH_LANES
from models import (
    LaneFeatures, SignalFeatures, SignalState, SimulationState, TrafficFeatures, VehicleState,
)
from services.snapshot_views import (
    decision_view, lanes_view, metrics_view, side_view, signal_view, vehicles_view,
)


def _state(phase_index=0, lane_states=None):
    vehicles = [
        VehicleState(id="v1", lane_id="N_in_0", speed=3.456, waiting_time=0.0,
                     position=(123.456, 200.001), type_id="bus"),
        VehicleState(id="v2", lane_id=":C_3_0", speed=0.0, waiting_time=2.0,
                     position=(200.0, 200.0), type_id="car_normal"),
    ]
    signal = SignalState(
        tls_id="C", raw_state="GGrrrrGGrrrr", current_phase_index=phase_index,
        seconds_until_next_switch=12.5,
        lane_states=MappingProxyType(lane_states or {"N_in_0": "G", "E_in_0": "r"}),
        seconds_in_current_phase=4.0,
    )
    return SimulationState(simulation_time=42.0, vehicles=vehicles, signal=signal)


def _features():
    lane = LaneFeatures(
        lane_id="N_in_0", vehicle_count=3, average_speed=1.0, average_waiting_time=7.5,
        max_waiting_time=9.0, stopped_vehicle_count=2, arrival_rate=0.0, departure_rate=0.0,
        stopped_vehicle_count_trend=0.0, waiting_time_trend=0.0,
    )
    return TrafficFeatures(
        simulation_time=42.0, total_vehicle_count=2, average_speed=1.73,
        average_waiting_time=1.0, stopped_vehicle_count=1,
        lane_features=MappingProxyType({"N_in_0": lane}),
        signal=SignalFeatures(seconds_in_current_phase=4.0, lane_signal_states=MappingProxyType({})),
    )


def _decision():
    return SimpleNamespace(
        active_phase="NS_straight_left", decision_mode="priority", switched=False,
        reason_text="holding", green_duration_seconds=3.0,
        phase_scores={"NS_straight_left": 0.5}, lane_scores={"N_in_0": 0.42},
    )


def test_signal_view_green_phase():
    v = signal_view(_state(phase_index=0))
    assert v == {"phase": "NS_straight_left", "is_yellow": False, "green": True, "countdown": 12.5}


def test_signal_view_yellow_phase_names_the_green_it_follows():
    v = signal_view(_state(phase_index=1))
    assert v["phase"] == "NS_straight_left" and v["is_yellow"] is True and v["green"] is False


def test_lanes_view_has_all_twelve_lanes_in_order():
    rows = lanes_view(_features(), {"N_in_0": 0.42}, {"N_in_0": "G"})
    assert [r["lane_id"] for r in rows] == list(ALL_APPROACH_LANES)
    first = rows[0]
    assert first == {"lane_id": "N_in_0", "vehicles": 3, "avg_wait": 7.5, "score": 0.42, "signal": "G"}
    absent = rows[1]
    assert absent["vehicles"] == 0 and absent["avg_wait"] == 0.0 and absent["score"] == 0.0 and absent["signal"] == "r"


def test_vehicles_view_rounds_and_carries_type():
    rows = vehicles_view(_state())
    assert rows[0] == {"id": "v1", "lane": "N_in_0", "x": 123.46, "y": 200.0, "speed": 3.46, "type": "bus"}
    assert rows[1]["lane"] == ":C_3_0"


def test_metrics_and_decision_views():
    assert metrics_view(_features()) == {
        "vehicles": 2, "avg_speed": 1.73, "avg_wait": 1.0, "queue": 1, "stopped": 1,
    }
    d = decision_view(_decision())
    assert d == {
        "active_phase": "NS_straight_left", "mode": "priority", "switched": False,
        "reason": "holding", "duration": 3.0, "phase_scores": {"NS_straight_left": 0.5},
    }


def test_side_view_has_exactly_the_evaluation_side_keys():
    side = side_view(_state(), _features(), _decision(), {"N_in_0": "G"}, [{"time": 1.0}])
    assert set(side) == {"signal", "metrics", "lanes", "vehicles", "decision", "phase_history"}
    assert side["phase_history"] == [{"time": 1.0}]
    assert "prediction" not in side
