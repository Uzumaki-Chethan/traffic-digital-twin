"""
feature_engineer.py
====================
FeatureEngineer, the module that converts the Digital Twin's current
SimulationState into a single TrafficFeatures object.

FeatureEngineer has exactly one responsibility: read the current state
from the Digital Twin it was constructed with, and aggregate the
VehicleState objects it contains into network-wide and per-lane
numerical features. It does not store history, make decisions, perform
machine learning, predict anything, or modify the Digital Twin in any
way, it only reads and aggregates.

It must never import traci or communicate with TraCIManager or
TrafficAdapter directly, its only dependency is the Digital Twin.
"""

from types import MappingProxyType
from typing import Dict, List, Sequence

from digital_twin import DigitalTwin
from models import (
    LaneFeatures,
    SignalFeatures,
    SignalState,
    SimulationState,
    TrafficFeatures,
    VehicleState,
)

# The speed, in metres per second, below which a vehicle is considered
# stopped. This is not an arbitrary choice, it is the same threshold
# SUMO itself uses to define a "halting" vehicle internally, reusing it
# keeps our definition of "stopped" consistent with SUMO's own.
STOPPED_SPEED_THRESHOLD_MPS = 0.1

# Ordinal mapping from a raw single-character TraCI signal state to the
# small integer scale SignalFeatures.lane_signal_states uses. Both 'G'
# (major/protected green) and 'g' (minor/yield green) map to the same
# ordinal, from a "what color is a driver on this lane looking at right
# now" perspective they are both green, the major/minor distinction is a
# controller-internal detail this feature intentionally does not expose,
# consistent with also excluding phase index as an ML feature.
_SIGNAL_CHAR_TO_ORDINAL = {
    "r": 0, "R": 0,
    "y": 1, "Y": 1,
    "g": 2, "G": 2,
}


class FeatureEngineer:
    """
    Reads the current SimulationState from a Digital Twin and produces a
    TrafficFeatures snapshot from it.

    Holds a reference to the DigitalTwin instance it reads from, the
    same dependency injection pattern TrafficAdapter already uses for
    TraCIManager, so this class has an explicit, documented dependency
    rather than an implicit one, and can be tested with a fake twin.
    """

    def __init__(self, digital_twin: DigitalTwin):
        self._digital_twin = digital_twin

    def generate_features(self) -> TrafficFeatures:
        """
        Generate a TrafficFeatures snapshot from the Digital Twin's
        current state.

        Raises
        ------
        RuntimeError
            If the Digital Twin has not yet been updated with a
            SimulationState. Checking this here means a caller gets one
            clear error instead of an AttributeError surfacing from deep
            inside the aggregation logic below.

        Returns
        -------
        TrafficFeatures
            Network-wide scalars alongside a per-lane breakdown keyed by
            lane_id.
        """
        state = self._digital_twin.current_state
        if state is None:
            raise RuntimeError(
                "FeatureEngineer cannot generate features: the Digital "
                "Twin has not yet been updated with a SimulationState."
            )

        return self._build_features(state)

    def _build_features(self, state: SimulationState) -> TrafficFeatures:
        """
        Aggregate a SimulationState's vehicles and signal into a
        TrafficFeatures object.
        """
        vehicles = state.vehicles
        signal_features = self._build_signal_features(state.signal)

        if not vehicles:
            return TrafficFeatures(
                simulation_time=state.simulation_time,
                total_vehicle_count=0,
                average_speed=0.0,
                average_waiting_time=0.0,
                stopped_vehicle_count=0,
                lane_features=TrafficFeatures.empty_lane_mapping(),
                signal=signal_features,
            )

        lane_features = self._build_lane_features(vehicles)

        return TrafficFeatures(
            simulation_time=state.simulation_time,
            total_vehicle_count=len(vehicles),
            average_speed=self._mean(v.speed for v in vehicles),
            average_waiting_time=self._mean(v.waiting_time for v in vehicles),
            stopped_vehicle_count=self._count_stopped(vehicles),
            lane_features=lane_features,
            signal=signal_features,
        )

    def _build_signal_features(self, signal: SignalState) -> SignalFeatures:
        """
        Translate a raw SignalState into the small, ML-facing
        SignalFeatures. This is the only place a raw signal character
        ('G', 'g', 'y', 'r') is converted into the ordinal scale ML
        input features use, see _SIGNAL_CHAR_TO_ORDINAL above.
        """
        lane_signal_states = {
            lane_id: _SIGNAL_CHAR_TO_ORDINAL.get(char, 0)
            for lane_id, char in signal.lane_states.items()
        }
        return SignalFeatures(
            seconds_until_next_switch=signal.seconds_until_next_switch,
            lane_signal_states=MappingProxyType(lane_signal_states),
        )

    def _build_lane_features(
        self, vehicles: Sequence[VehicleState]
    ) -> Dict[str, LaneFeatures]:
        """
        Group vehicles by lane_id and aggregate each group into a
        LaneFeatures object. Returned as a MappingProxyType so the
        resulting TrafficFeatures.lane_features can never be mutated
        after this method returns.
        """
        vehicles_by_lane: Dict[str, List[VehicleState]] = {}
        for vehicle in vehicles:
            vehicles_by_lane.setdefault(vehicle.lane_id, []).append(vehicle)

        lane_features = {
            lane_id: self._aggregate_lane(lane_id, lane_vehicles)
            for lane_id, lane_vehicles in vehicles_by_lane.items()
        }
        return MappingProxyType(lane_features)

    def _aggregate_lane(
        self, lane_id: str, vehicles: Sequence[VehicleState]
    ) -> LaneFeatures:
        """
        Aggregate the vehicles present on a single lane into a
        LaneFeatures object. vehicles is guaranteed non-empty by the
        caller, since it only ever receives groups that were actually
        built from at least one vehicle.
        """
        waiting_times = [v.waiting_time for v in vehicles]

        return LaneFeatures(
            lane_id=lane_id,
            vehicle_count=len(vehicles),
            average_speed=self._mean(v.speed for v in vehicles),
            average_waiting_time=self._mean(waiting_times),
            max_waiting_time=max(waiting_times),
            stopped_vehicle_count=self._count_stopped(vehicles),
        )

    @staticmethod
    def _mean(values) -> float:
        """
        Arithmetic mean of an iterable of floats, returning 0.0 for an
        empty iterable rather than raising, since "no vehicles" is a
        normal, expected state, not an error.
        """
        values = list(values)
        if not values:
            return 0.0
        return sum(values) / len(values)

    @staticmethod
    def _count_stopped(vehicles: Sequence[VehicleState]) -> int:
        """
        Count vehicles whose speed is at or below
        STOPPED_SPEED_THRESHOLD_MPS, SUMO's own definition of halting.
        """
        return sum(
            1 for v in vehicles if v.speed < STOPPED_SPEED_THRESHOLD_MPS
        )