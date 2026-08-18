"""
feature_engineer.py
====================
FeatureEngineer, the module that converts the Digital Twin's current
SimulationState, and its bounded history, into a single TrafficFeatures
object.

FeatureEngineer has exactly one responsibility: read state from the
Digital Twin it was constructed with, and aggregate it (both the
current snapshot and a short lookback into history) into network-wide
and per-lane numerical features. It does not store its own history
(DigitalTwin already does that), make decisions, perform machine
learning, predict anything, or modify the Digital Twin in any way, it
only reads and aggregates.

It must never import traci or communicate with TraCIManager or
TrafficAdapter directly, its only dependency is the Digital Twin. It
also never imports from the ml package, that would invert the actual
pipeline dependency direction (ml consumes FeatureEngineer's output
type, FeatureEngineer must not depend on ml), see
TREND_LOOKBACK_SECONDS below for the one deliberate consequence of that
rule.
"""

from types import MappingProxyType
from typing import Dict, List, Optional, Sequence, Tuple

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
# small integer scale SignalFeatures.lane_signal_states uses.
_SIGNAL_CHAR_TO_ORDINAL = {
    "r": 0, "R": 0,
    "y": 1, "Y": 1,
    "g": 2, "G": 2,
}

# How far back, in simulated seconds, temporal trend features look.
# Deliberately equal to ml.feature_schema.PREDICTION_HORIZON_SECONDS
# (15.0 seconds as of the second training milestone, raised from 5.0 -
# see that constant's comment for the reasoning), a symmetric "how much
# has this lane changed over the same duration we are trying to predict
# forward" choice, not an arbitrary window. This is a plain, independent
# constant here, NOT imported from ml.feature_schema, importing it would
# make feature_engineering (which is upstream in the pipeline) depend on
# ml (which is downstream and consumes FeatureEngineer's output type),
# inverting the actual dependency direction. This is a deliberate, named
# trade-off: if PREDICTION_HORIZON_SECONDS ever changes, this constant
# must be updated to match by hand, it will not happen automatically -
# this update is that by-hand sync, done deliberately, not missed.
TREND_LOOKBACK_SECONDS = 15.0

# Below this many seconds of elapsed time between the current snapshot
# and a candidate lookback snapshot, trend rates are not computed (all
# trend fields default to 0.0), avoids division by a near-zero elapsed
# time producing an artificially extreme rate from sampling jitter.
_MIN_ELAPSED_SECONDS_FOR_TREND = 0.01


class FeatureEngineer:
    """
    Reads the current SimulationState, and a short lookback into
    history, from a Digital Twin and produces a TrafficFeatures snapshot.

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
        current state and recent history.

        Raises
        ------
        RuntimeError
            If the Digital Twin has not yet been updated with a
            SimulationState.

        Returns
        -------
        TrafficFeatures
            Network-wide scalars alongside a per-lane breakdown keyed by
            lane_id, each lane carrying both instantaneous and
            short-horizon trend features.
        """
        state = self._digital_twin.current_state
        if state is None:
            raise RuntimeError(
                "FeatureEngineer cannot generate features: the Digital "
                "Twin has not yet been updated with a SimulationState."
            )

        past_state = self._find_lookback_state(state.simulation_time)
        return self._build_features(state, past_state)

    def _find_lookback_state(
        self, current_time: float
    ) -> Optional[SimulationState]:
        """
        Search the Digital Twin's history for the most recent snapshot
        that is at least TREND_LOOKBACK_SECONDS older than current_time.

        Searches from the most recent end of history backward, since
        the target is almost always found within the first
        TREND_LOOKBACK_SECONDS / step_length entries, not deep into the
        full retained history, this keeps the search cheap regardless of
        how large history_size is configured.

        Returns
        -------
        SimulationState | None
            None if history does not yet contain a snapshot old enough,
            which is the normal, expected situation for the first
            TREND_LOOKBACK_SECONDS of any run, not an error.
        """
        for past_state in reversed(self._digital_twin.history):
            elapsed = current_time - past_state.simulation_time
            if elapsed >= TREND_LOOKBACK_SECONDS:
                return past_state
        return None

    def _build_features(
        self, state: SimulationState, past_state: Optional[SimulationState]
    ) -> TrafficFeatures:
        """
        Aggregate a SimulationState's vehicles and signal, plus a
        lookback SimulationState for trend computation, into a
        TrafficFeatures object.
        """
        vehicles = state.vehicles
        signal_features = self._build_signal_features(state.signal)
        lane_features = self._build_lane_features(state, past_state)

        if not vehicles:
            return TrafficFeatures(
                simulation_time=state.simulation_time,
                total_vehicle_count=0,
                average_speed=0.0,
                average_waiting_time=0.0,
                stopped_vehicle_count=0,
                lane_features=lane_features,
                signal=signal_features,
            )

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
        SignalFeatures.
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
        self, state: SimulationState, past_state: Optional[SimulationState]
    ) -> Dict[str, LaneFeatures]:
        """
        Build a LaneFeatures entry for every lane that either has
        vehicles now, or had vehicles at the lookback snapshot.

        The second half of that condition matters: a lane that was
        queued at the lookback point but has since fully cleared has a
        real, meaningful departure_rate, dropping it entirely (which the
        "only lanes with current vehicles" rule alone would do) would
        silently discard exactly the highest-value case for that
        feature.

        Returned as a MappingProxyType so the resulting
        TrafficFeatures.lane_features can never be mutated after this
        method returns.
        """
        current_by_lane = self._group_by_lane(state.vehicles)
        past_by_lane = (
            self._group_by_lane(past_state.vehicles) if past_state else {}
        )
        elapsed = (
            state.simulation_time - past_state.simulation_time
            if past_state else 0.0
        )

        lane_ids = set(current_by_lane.keys()) | set(past_by_lane.keys())

        lane_features = {
            lane_id: self._aggregate_lane(
                lane_id,
                current_by_lane.get(lane_id, []),
                past_by_lane.get(lane_id, []),
                elapsed,
            )
            for lane_id in lane_ids
        }
        return MappingProxyType(lane_features)

    @staticmethod
    def _group_by_lane(
        vehicles: Sequence[VehicleState],
    ) -> Dict[str, List[VehicleState]]:
        """
        Group a sequence of vehicles by lane_id. Shared by both the
        current and the lookback snapshot, so this grouping logic exists
        in exactly one place rather than being duplicated for each.
        """
        grouped: Dict[str, List[VehicleState]] = {}
        for vehicle in vehicles:
            grouped.setdefault(vehicle.lane_id, []).append(vehicle)
        return grouped

    def _aggregate_lane(
        self,
        lane_id: str,
        current_vehicles: Sequence[VehicleState],
        past_vehicles: Sequence[VehicleState],
        elapsed: float,
    ) -> LaneFeatures:
        """
        Aggregate one lane's current vehicles into instantaneous
        features, and combine current + past vehicles into trend
        features, for a single LaneFeatures object.

        current_vehicles and/or past_vehicles may be empty (this method
        is called for the union of lanes with current or past vehicles,
        not the intersection), instantaneous fields are 0.0 for a lane
        with no current vehicles, exactly as before this milestone.
        """
        if current_vehicles:
            waiting_times = [v.waiting_time for v in current_vehicles]
            vehicle_count = len(current_vehicles)
            average_speed = self._mean(v.speed for v in current_vehicles)
            average_waiting_time = self._mean(waiting_times)
            max_waiting_time = max(waiting_times)
            stopped_vehicle_count = self._count_stopped(current_vehicles)
        else:
            vehicle_count = 0
            average_speed = 0.0
            average_waiting_time = 0.0
            max_waiting_time = 0.0
            stopped_vehicle_count = 0

        arrival_rate, departure_rate = self._compute_flow_rates(
            current_vehicles, past_vehicles, elapsed
        )
        stopped_vehicle_count_trend = self._compute_trend(
            stopped_vehicle_count,
            self._count_stopped(past_vehicles) if past_vehicles else 0,
            elapsed,
        )
        past_average_waiting_time = (
            self._mean(v.waiting_time for v in past_vehicles)
            if past_vehicles else 0.0
        )
        waiting_time_trend = self._compute_trend(
            average_waiting_time, past_average_waiting_time, elapsed
        )

        return LaneFeatures(
            lane_id=lane_id,
            vehicle_count=vehicle_count,
            average_speed=average_speed,
            average_waiting_time=average_waiting_time,
            max_waiting_time=max_waiting_time,
            stopped_vehicle_count=stopped_vehicle_count,
            arrival_rate=arrival_rate,
            departure_rate=departure_rate,
            stopped_vehicle_count_trend=stopped_vehicle_count_trend,
            waiting_time_trend=waiting_time_trend,
        )

    @staticmethod
    def _compute_flow_rates(
        current_vehicles: Sequence[VehicleState],
        past_vehicles: Sequence[VehicleState],
        elapsed: float,
    ) -> Tuple[float, float]:
        """
        Compute (arrival_rate, departure_rate) from the vehicle ID sets
        present now versus at the lookback point.

        arrival_rate: vehicles present now, by ID, that were not present
        at the lookback point, per second.
        departure_rate: vehicles present at the lookback point, by ID,
        that are no longer present now, per second.

        Deliberately kept as two separate rates rather than exposing
        only their difference, see FeatureEngineer's module docstring
        and the design review for why that difference matters here.
        """
        if elapsed < _MIN_ELAPSED_SECONDS_FOR_TREND:
            return 0.0, 0.0

        current_ids = {v.id for v in current_vehicles}
        past_ids = {v.id for v in past_vehicles}

        arrivals = len(current_ids - past_ids)
        departures = len(past_ids - current_ids)

        return arrivals / elapsed, departures / elapsed

    @staticmethod
    def _compute_trend(
        current_value: float, past_value: float, elapsed: float
    ) -> float:
        """
        Generic (current - past) / elapsed rate of change, shared by
        both the stopped_vehicle_count_trend and waiting_time_trend
        calculations, so this division-by-elapsed-time logic exists in
        exactly one place.
        """
        if elapsed < _MIN_ELAPSED_SECONDS_FOR_TREND:
            return 0.0
        return (current_value - past_value) / elapsed

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