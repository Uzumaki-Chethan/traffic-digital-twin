"""
prediction_models.py
=====================
Strongly typed, immutable data contracts describing ML prediction
output. This is the API contract between the ML layer and the future
Decision Engine, nothing else should shape what a prediction looks like.

No prediction logic lives here, no model inference, no feature vector
construction, these classes are pure data containers, exactly like
SimulationState, VehicleState, LaneFeatures, and TrafficFeatures before
them. That work belongs to MLPredictor.

Both classes are frozen, and TrafficPrediction uses a MappingProxyType
for its per-lane breakdown, consistent with TrafficFeatures.lane_features,
so a TrafficPrediction can never be mutated after it is created.
"""

from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class LanePrediction:
    """
    Predicted future traffic state for a single lane.

    Mirrors LaneFeatures's lane_id keying convention deliberately, so a
    future Decision Engine can pair a lane's current features against its
    prediction without any translation step.

    Attributes
    ----------
    lane_id : str
        The SUMO lane ID this prediction describes, matching the same
        lane_id used in TrafficFeatures.lane_features.
    predicted_vehicle_count : float
        Predicted number of vehicles on this lane at the predicted time.
        Kept as a float, not rounded to int, since it is a regression
        output, rounding is a decision for whichever consumer needs an
        integer, not something the ML layer should decide on its behalf.
    predicted_average_waiting_time : float
        Predicted mean waiting time, in seconds, of vehicles on this lane
        at the predicted time.
    confidence : float
        A 0 to 100 confidence score for this lane's prediction, derived
        from the spread of individual Random Forest trees' predictions.
        Lower spread relative to the mean prediction yields a higher
        confidence score.
    """

    lane_id: str
    predicted_vehicle_count: float
    predicted_average_waiting_time: float
    confidence: float


@dataclass(frozen=True)
class TrafficPrediction:
    """
    A single, complete set of future traffic state predictions, produced
    from one TrafficFeatures snapshot.

    Attributes
    ----------
    reference_time : float
        The simulation_time of the TrafficFeatures snapshot this
        prediction was generated from.
    prediction_horizon_seconds : float
        How far into the future, in seconds, this prediction looks.
    lane_predictions : Mapping[str, LanePrediction]
        Per-lane predictions, keyed by lane_id. A read-only mapping
        (backed by types.MappingProxyType), never a plain dict.
    """

    reference_time: float
    prediction_horizon_seconds: float
    lane_predictions: Mapping[str, LanePrediction]

    @property
    def predicted_time(self) -> float:
        """
        The simulation time this prediction is actually for, computed
        rather than stored, so reference_time and prediction_horizon_seconds
        remain the single source of truth.
        """
        return self.reference_time + self.prediction_horizon_seconds