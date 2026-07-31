"""
feature_schema.py
==================
The single source of truth for how a TrafficFeatures snapshot is
flattened into a numeric feature vector, and how a future TrafficFeatures
snapshot is flattened into a numeric target vector.

Both MLPredictor (at inference time) and the training pipeline (at
dataset-generation time) import from this module rather than each
implementing their own column ordering. Before this module existed,
that ordering lived only inside MLPredictor's private
_build_feature_vector method, a training pipeline built independently
would have had no choice but to reimplement it, with nothing to detect
a silent mismatch. This module exists specifically to remove that risk.

This module contains pure data and pure functions only, no I/O, no model
loading, no SUMO or TraCI awareness of any kind.
"""

from typing import List, Tuple

from models import TrafficFeatures

# Canonical, ordered list of lane IDs the feature vector and target
# vector are built against. This is a deliberate coupling to the frozen
# network's channelization design (one dedicated lane per movement), not
# to volatile geometry, this list will not change unless the network's
# connections are redesigned.
EXPECTED_LANE_IDS: Tuple[str, ...] = (
    "N_in_0", "N_in_1", "N_in_2",
    "S_in_0", "S_in_1", "S_in_2",
    "E_in_0", "E_in_1", "E_in_2",
    "W_in_0", "W_in_1", "W_in_2",
)

# Network-wide feature names, in the order they appear at the start of
# the feature vector. The first four are read directly off
# TrafficFeatures, seconds_until_next_signal_switch is read off
# TrafficFeatures.signal, a network-wide quantity since this junction
# has a single shared tlLogic clock, not an independent one per lane.
NETWORK_FEATURE_NAMES: Tuple[str, ...] = (
    "total_vehicle_count",
    "average_speed",
    "average_waiting_time",
    "stopped_vehicle_count",
    "seconds_until_next_signal_switch",
)

# Per-lane feature names, in the order each lane's block appears in the
# feature vector. The first five are read directly off LaneFeatures,
# current_signal_state is read off TrafficFeatures.signal.lane_signal_states
# for the same lane_id, an ordinal (0=red, 1=yellow, 2=green). Included
# specifically because it is the direct, phase-table-independent answer
# to "is this lane's traffic likely to keep moving or start queuing over
# the prediction horizon", see the architecture design review for why
# phase index, phase name, elapsed time, next phase, and cycle length
# were all considered and rejected instead.
LANE_FEATURE_NAMES: Tuple[str, ...] = (
    "vehicle_count",
    "average_speed",
    "average_waiting_time",
    "max_waiting_time",
    "stopped_vehicle_count",
    "current_signal_state",
)

# Per-lane target names, the two raw LaneFeatures fields a future
# snapshot is read from to build a training label. These are raw
# TrafficFeatures fields, not LanePrediction fields, a label is a fact
# about what actually happened, a prediction is a model's estimate of it.
TARGET_FEATURE_NAMES: Tuple[str, ...] = (
    "vehicle_count",
    "average_waiting_time",
)

# How far into the future, in seconds, a target snapshot is taken
# relative to its feature snapshot. This lives here, not duplicated in
# MLPredictor or the training pipeline, so both always agree.
# This value must eventually be written into the trained model's
# metadata file (see training/train.py), this constant is the default
# used to produce that metadata, not a substitute for storing it.
PREDICTION_HORIZON_SECONDS: float = 5.0

FEATURE_VECTOR_LENGTH: int = len(NETWORK_FEATURE_NAMES) + (
    len(EXPECTED_LANE_IDS) * len(LANE_FEATURE_NAMES)
)
TARGET_VECTOR_LENGTH: int = len(EXPECTED_LANE_IDS) * len(TARGET_FEATURE_NAMES)


def features_to_vector(features: TrafficFeatures) -> List[float]:
    """
    Flatten a TrafficFeatures snapshot into the fixed-order feature
    vector both MLPredictor and the training pipeline expect.

    Column order: NETWORK_FEATURE_NAMES, then one block per lane in
    EXPECTED_LANE_IDS order, each block in LANE_FEATURE_NAMES order.

    Lanes with no vehicles currently present are not included in
    TrafficFeatures.lane_features at all (FeatureEngineer only creates
    entries for lanes with at least one vehicle), any lane missing from
    features.lane_features is filled with zeros for its vehicle-derived
    columns here, consistent with FeatureEngineer's own "no vehicles
    means 0.0" convention. Signal state is looked up separately from
    features.signal.lane_signal_states, which always has an entry for
    every controlled lane regardless of vehicle presence, a lane with no
    vehicles still has a real, current signal color.

    Parameters
    ----------
    features : TrafficFeatures

    Returns
    -------
    List[float]
        Length FEATURE_VECTOR_LENGTH.
    """
    vector: List[float] = [
        float(features.total_vehicle_count),
        float(features.average_speed),
        float(features.average_waiting_time),
        float(features.stopped_vehicle_count),
        float(features.signal.seconds_until_next_switch),
    ]

    for lane_id in EXPECTED_LANE_IDS:
        lane = features.lane_features.get(lane_id)
        if lane is None:
            vector.extend([0.0] * (len(LANE_FEATURE_NAMES) - 1))
        else:
            vector.extend([
                float(lane.vehicle_count),
                float(lane.average_speed),
                float(lane.average_waiting_time),
                float(lane.max_waiting_time),
                float(lane.stopped_vehicle_count),
            ])
        signal_state = features.signal.lane_signal_states.get(lane_id, 0)
        vector.append(float(signal_state))

    return vector


def targets_to_vector(future_features: TrafficFeatures) -> List[float]:
    """
    Flatten a *future* TrafficFeatures snapshot (one taken
    PREDICTION_HORIZON_SECONDS after the corresponding feature snapshot)
    into the fixed-order target vector used as a training label.

    Column order: one block per lane in EXPECTED_LANE_IDS order, each
    block in TARGET_FEATURE_NAMES order. This must stay index-aligned
    with what MLPredictor's output is interpreted as, lane_output_index()
    below is the shared source of truth for that alignment.

    Parameters
    ----------
    future_features : TrafficFeatures
        A TrafficFeatures snapshot taken at the target time, not the
        current time, callers are responsible for pairing snapshots
        correctly, this function only flattens whatever it is given.

    Returns
    -------
    List[float]
        Length TARGET_VECTOR_LENGTH.
    """
    vector: List[float] = []

    for lane_id in EXPECTED_LANE_IDS:
        lane = future_features.lane_features.get(lane_id)
        if lane is None:
            vector.extend([0.0] * len(TARGET_FEATURE_NAMES))
        else:
            vector.extend([
                float(lane.vehicle_count),
                float(lane.average_waiting_time),
            ])

    return vector


def lane_output_index(lane_id: str) -> Tuple[int, int]:
    """
    Return the (vehicle_count_column, waiting_time_column) indices for a
    given lane within a target or prediction vector of length
    TARGET_VECTOR_LENGTH.

    Both MLPredictor (reading model output) and the training pipeline
    (reading target vectors, for example during per-lane evaluation)
    use this instead of independently re-deriving the same arithmetic.

    Raises
    ------
    ValueError
        If lane_id is not one of EXPECTED_LANE_IDS.
    """
    try:
        lane_index = EXPECTED_LANE_IDS.index(lane_id)
    except ValueError as exc:
        raise ValueError(
            "'{}' is not one of the expected lane IDs: {}".format(
                lane_id, EXPECTED_LANE_IDS
            )
        ) from exc

    targets_per_lane = len(TARGET_FEATURE_NAMES)
    vehicle_count_col = lane_index * targets_per_lane
    waiting_time_col = vehicle_count_col + 1
    return vehicle_count_col, waiting_time_col