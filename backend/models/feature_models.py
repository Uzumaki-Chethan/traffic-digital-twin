"""
feature_models.py
==================
Strongly typed, immutable data contracts describing engineered traffic
features, derived from SimulationState but distinct from it.

Where SimulationState/VehicleState describe raw, per-vehicle facts
exactly as TraCI reported them, LaneFeatures and TrafficFeatures describe
aggregated, numerical signals intended for consumption by Machine
Learning, the Decision Engine, the Dashboard, and Performance Evaluation.
No aggregation logic lives here, these classes are pure data containers,
the aggregation itself is FeatureEngineer's responsibility.

Both classes are frozen, and TrafficFeatures uses a MappingProxyType for
its per-lane breakdown rather than a plain dict, so that, consistent with
SimulationState and VehicleState, a TrafficFeatures snapshot can never be
mutated in place after it is created.
"""

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping


@dataclass(frozen=True)
class LaneFeatures:
    """
    Aggregated, per-lane traffic features for a single simulation step.

    Each lane in this network is dedicated to exactly one signal-controlled
    movement (for example N_in_1 carries only the North-straight
    movement), so these per-lane figures are what a future Decision
    Engine will actually read from when allocating green time per phase.

    Attributes
    ----------
    lane_id : str
        The SUMO lane ID these features describe.
    vehicle_count : int
        Number of vehicles currently present on this lane.
    average_speed : float
        Mean speed, in metres per second, of vehicles on this lane.
        0.0 if the lane currently has no vehicles.
    average_waiting_time : float
        Mean accumulated waiting time, in seconds, of vehicles on this
        lane. 0.0 if the lane currently has no vehicles.
    max_waiting_time : float
        The single longest waiting time, in seconds, of any vehicle on
        this lane. 0.0 if the lane currently has no vehicles. Exposed
        separately from the average because an average can hide a single
        badly starved vehicle behind many freshly arrived ones, a future
        fairness or starvation check needs the worst case, not the mean.
    stopped_vehicle_count : int
        Number of vehicles on this lane considered stopped, defined as
        speed below 0.1 metres per second, the same threshold SUMO
        itself uses to define a halting vehicle.
    """

    lane_id: str
    vehicle_count: int
    average_speed: float
    average_waiting_time: float
    max_waiting_time: float
    stopped_vehicle_count: int


@dataclass(frozen=True)
class TrafficFeatures:
    """
    A single, complete set of engineered traffic features for one
    simulation step, derived from the Digital Twin's current
    SimulationState.

    Carries both network-wide scalars (useful for the Dashboard and
    Performance Evaluation, which care about overall system health) and
    a per-lane breakdown (useful for the Decision Engine, which needs to
    reason about individual signal-controlled movements).

    Attributes
    ----------
    simulation_time : float
        The simulation time this feature snapshot corresponds to.
    total_vehicle_count : int
        Number of vehicles present across the entire network.
    average_speed : float
        Mean speed, in metres per second, across every vehicle in the
        network. 0.0 if no vehicles are present.
    average_waiting_time : float
        Mean accumulated waiting time, in seconds, across every vehicle
        in the network. 0.0 if no vehicles are present.
    stopped_vehicle_count : int
        Number of vehicles across the whole network considered stopped
        (speed below 0.1 metres per second).
    lane_features : Mapping[str, LaneFeatures]
        Per-lane engineered features, keyed by lane_id. A read-only
        mapping (backed by types.MappingProxyType), never a plain dict,
        so it cannot be mutated after this TrafficFeatures is created.
    """

    simulation_time: float
    total_vehicle_count: int
    average_speed: float
    average_waiting_time: float
    stopped_vehicle_count: int
    lane_features: Mapping[str, LaneFeatures]

    @staticmethod
    def empty_lane_mapping() -> Mapping[str, LaneFeatures]:
        """
        Convenience factory for an empty, immutable lane_features
        mapping, used when no vehicles are present in the network.
        """
        return MappingProxyType({})