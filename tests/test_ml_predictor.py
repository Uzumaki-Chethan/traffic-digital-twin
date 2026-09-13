"""
test_ml_predictor.py
=====================
Offline tests (no SUMO, no trained model on disk) for the two changes
made to the prediction path on 2026-09-13:

  1. Residual target mode - the forest predicts the CHANGE over the
     horizon; MLPredictor adds the current value back and clips at zero.
     The mode travels with the model in its metadata file.
  2. The adapter's phase clock (SignalState.seconds_in_current_phase),
     which replaced the next-switch countdown as the ML feature.

Run from backend/ (or with backend/ on PYTHONPATH):
    cd backend && pytest ../tests/test_ml_predictor.py
"""

import json
import sys
from pathlib import Path
from types import MappingProxyType

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import joblib
import numpy as np
import pytest
from sklearn.ensemble import RandomForestRegressor

from ml.feature_schema import (
    EXPECTED_LANE_IDS,
    FEATURE_VECTOR_LENGTH,
    TARGET_MODE_ABSOLUTE,
    TARGET_MODE_RESIDUAL,
    TARGET_VECTOR_LENGTH,
    current_values_as_target_vector,
    lane_output_index,
    targets_to_vector,
)
from ml.ml_predictor import MLPredictor
from models import LaneFeatures, SignalFeatures, TrafficFeatures

COUNT_DELTA = -1.0
WAIT_DELTA = 2.0


def _constant_forest():
    """A real (tiny) RandomForestRegressor whose every tree predicts the
    same constant vector, so predictions are known exactly and the
    fast tree_.predict() path MLPredictor relies on is exercised for
    real rather than mocked."""
    rng = np.random.default_rng(0)
    X = rng.random((8, FEATURE_VECTOR_LENGTH))
    Y = np.tile(
        [COUNT_DELTA, WAIT_DELTA] * len(EXPECTED_LANE_IDS), (8, 1)
    ).astype(float)
    assert Y.shape[1] == TARGET_VECTOR_LENGTH
    return RandomForestRegressor(n_estimators=3, random_state=0).fit(X, Y)


def _lane(lane_id, count, wait):
    return LaneFeatures(
        lane_id=lane_id,
        vehicle_count=count,
        average_speed=1.0,
        average_waiting_time=wait,
        max_waiting_time=wait,
        stopped_vehicle_count=0,
        arrival_rate=0.0,
        departure_rate=0.0,
        stopped_vehicle_count_trend=0.0,
        waiting_time_trend=0.0,
    )


def _features(present):
    """present: {lane_id: (count, wait)} - other lanes have NO entry,
    the 'never had a vehicle' case the schema fills with zeros."""
    lanes = {lid: _lane(lid, c, w) for lid, (c, w) in present.items()}
    return TrafficFeatures(
        simulation_time=100.0,
        total_vehicle_count=sum(c for c, _ in present.values()),
        average_speed=1.0,
        average_waiting_time=0.0,
        stopped_vehicle_count=0,
        lane_features=MappingProxyType(lanes),
        signal=SignalFeatures(
            seconds_in_current_phase=12.0,
            lane_signal_states=MappingProxyType({lid: 0 for lid in EXPECTED_LANE_IDS}),
        ),
    )


# ---- schema alignment ------------------------------------------------------

def test_current_values_vector_aligns_with_target_vector():
    f = _features({"N_in_0": (3, 1.5), "W_in_2": (7, 20.0)})
    base = current_values_as_target_vector(f)
    # Same snapshot fed as a "future" gives the identical layout - the
    # two functions are the same mapping applied to two moments.
    assert base == targets_to_vector(f)
    assert len(base) == TARGET_VECTOR_LENGTH
    vc, wt = lane_output_index("W_in_2")
    assert base[vc] == 7.0 and base[wt] == 20.0
    vc, wt = lane_output_index("S_in_1")  # absent lane
    assert base[vc] == 0.0 and base[wt] == 0.0


# ---- residual vs absolute --------------------------------------------------

def test_absolute_mode_reports_raw_forest_output():
    p = MLPredictor(_constant_forest(), target_mode=TARGET_MODE_ABSOLUTE)
    pred = p.predict(_features({"N_in_0": (3, 1.5)}))
    lane = pred.lane_predictions["N_in_0"]
    assert lane.predicted_vehicle_count == pytest.approx(COUNT_DELTA)
    assert lane.predicted_average_waiting_time == pytest.approx(WAIT_DELTA)


def test_residual_mode_adds_current_value_back():
    p = MLPredictor(_constant_forest(), target_mode=TARGET_MODE_RESIDUAL)
    pred = p.predict(_features({"N_in_0": (3, 1.5)}))
    lane = pred.lane_predictions["N_in_0"]
    assert lane.predicted_vehicle_count == pytest.approx(3 + COUNT_DELTA)
    assert lane.predicted_average_waiting_time == pytest.approx(1.5 + WAIT_DELTA)


def test_residual_mode_clips_at_zero_for_absent_lane():
    p = MLPredictor(_constant_forest(), target_mode=TARGET_MODE_RESIDUAL)
    pred = p.predict(_features({"N_in_0": (3, 1.5)}))
    empty = pred.lane_predictions["S_in_1"]  # no entry -> base 0
    assert empty.predicted_vehicle_count == 0.0  # 0 + (-1) clipped
    assert empty.predicted_average_waiting_time == pytest.approx(WAIT_DELTA)


def test_residual_mode_leaves_confidence_range_valid():
    p = MLPredictor(_constant_forest(), target_mode=TARGET_MODE_RESIDUAL)
    pred = p.predict(_features({"E_in_2": (10, 30.0)}))
    for lane in pred.lane_predictions.values():
        assert 0.0 <= lane.confidence <= 100.0


def test_unknown_target_mode_is_rejected():
    with pytest.raises(ValueError):
        MLPredictor(_constant_forest(), target_mode="delta")


def test_from_path_reads_target_mode_from_metadata(tmp_path):
    model_path = tmp_path / "m.joblib"
    joblib.dump(_constant_forest(), model_path)
    # no metadata -> absolute (a model from before residual mode)
    assert MLPredictor.from_path(str(model_path)).target_mode == TARGET_MODE_ABSOLUTE
    (tmp_path / "m.metadata.json").write_text(
        json.dumps({"target_mode": TARGET_MODE_RESIDUAL}), encoding="utf-8"
    )
    assert MLPredictor.from_path(str(model_path)).target_mode == TARGET_MODE_RESIDUAL


# ---- adapter phase clock ---------------------------------------------------

class _FakeTrafficLight:
    def __init__(self):
        self.phase = 0
        self.duration = 30.0
        self.next_switch = 30.0
        self.links = [[("N_in_0", "N_out_0", ":C_0_0")]]

    def getRedYellowGreenState(self, tls_id): return "G"
    def getPhase(self, tls_id): return self.phase
    def getNextSwitch(self, tls_id): return self.next_switch
    def getPhaseDuration(self, tls_id): return self.duration
    def getControlledLinks(self, tls_id): return self.links


class _FakeTraci:
    def __init__(self):
        self.trafficlight = _FakeTrafficLight()


class _FakeManager:
    def __init__(self):
        self.connection = _FakeTraci()
        self.is_connected = True


def _adapter():
    from traffic_adapter.adapter import TrafficAdapter
    m = _FakeManager()
    return TrafficAdapter(m), m.connection.trafficlight


def test_phase_clock_recovers_elapsed_on_first_read():
    adapter, tl = _adapter()
    # Attached mid-phase: 30 s phase, 20 s remaining at t=100 -> 10 s elapsed.
    tl.next_switch = 120.0
    sig = adapter._extract_signal(100.0)
    assert sig.seconds_in_current_phase == pytest.approx(10.0)
    assert sig.seconds_until_next_switch == pytest.approx(20.0)


def test_phase_clock_counts_up_and_resets_on_phase_change():
    adapter, tl = _adapter()
    tl.next_switch = 30.0
    assert adapter._extract_signal(0.05).seconds_in_current_phase == pytest.approx(0.05)
    assert adapter._extract_signal(12.0).seconds_in_current_phase == pytest.approx(12.0)
    tl.phase = 1  # yellow
    assert adapter._extract_signal(30.0).seconds_in_current_phase == pytest.approx(0.0)
    assert adapter._extract_signal(32.0).seconds_in_current_phase == pytest.approx(2.0)
    tl.phase = 2
    assert adapter._extract_signal(33.0).seconds_in_current_phase == pytest.approx(0.0)


def test_phase_clock_is_zero_when_controller_rearms_ceiling_each_tick():
    """Under the adaptive controller the SUMO-side duration is re-armed
    to a 60 s ceiling every tick; 'duration - remaining' is then ~0 on
    first read, and the clock counts from there rather than from the
    meaningless countdown."""
    adapter, tl = _adapter()
    tl.duration = 60.0
    tl.next_switch = 100.0 + 60.0
    assert adapter._extract_signal(100.0).seconds_in_current_phase == pytest.approx(0.0)
    tl.next_switch = 105.0 + 60.0  # re-armed again
    assert adapter._extract_signal(105.0).seconds_in_current_phase == pytest.approx(5.0)
