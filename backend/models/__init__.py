"""
models package
==============
Strongly typed data contracts shared across the whole backend. These
dataclasses are the only shape simulation state is allowed to take once
it leaves TrafficAdapter, no layer above the adapter should ever see or
construct a raw dictionary of vehicle data again.
"""

from .state_models import SignalState, SimulationState, VehicleState
from .feature_models import LaneFeatures, SignalFeatures, TrafficFeatures
from .prediction_models import LanePrediction, TrafficPrediction

__all__ = [
    "SignalState",
    "SimulationState",
    "VehicleState",
    "LaneFeatures",
    "SignalFeatures",
    "TrafficFeatures",
    "LanePrediction",
    "TrafficPrediction",
]