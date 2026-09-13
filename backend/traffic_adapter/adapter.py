"""
adapter.py
==========
The Traffic Adapter, the single boundary between raw TraCI calls and the
rest of the project. No other module is permitted to import traci or
call traci.vehicle.* / traci.simulation.* / traci.edge.* / traci.lane.* /
traci.trafficlight.* directly, everything downstream (Digital Twin,
Feature Engineering, Decision Engine) works only with the SimulationState,
VehicleState, and SignalState objects this class returns.

This module deliberately does no interpretation of the data it reads, no
density, no congestion classification, no phase selection logic, no ML.
It only extracts current raw state, exactly as TraCI reports it, into
strongly typed, immutable dataclasses.

MULTI-INSTANCE SUPPORT: each TrafficAdapter binds to the TraCI connection
owned by ITS OWN TraCIManager (see __init__). With a single simulation
this is equivalent to the module-level default connection; with
Performance Evaluation's two parallel labeled connections ("ai" /
"baseline") it is what guarantees this adapter always reads from its own
SUMO process and never crosses over into the other simulation's state.
"""

import logging
from types import MappingProxyType
from typing import Dict, List, Tuple

import traci

from models import SignalState, SimulationState, VehicleState

logger = logging.getLogger(__name__)

# This is the only traffic light this frozen, single-junction network
# has. Multi-junction support later means iterating over
# traci.trafficlight.getIDList() instead of hardcoding this, deliberately
# not built now, see the design review's note on deferred multi-junction
# support.
_TLS_ID = "C"


class TrafficAdapter:
    """
    Reads raw simulation state from an already running TraCI connection
    and converts it into strongly typed dataclasses.

    Holds a reference to the TraCIManager instance that owns the
    connection, both to check its is_connected property before reading
    any data, and so this class has an explicit, documented dependency
    on a live connection rather than an implicit one. Lifecycle methods
    (start/run/close) remain TraCIManager's exclusive responsibility,
    this class never calls them.
    """

    def __init__(self, traci_manager):
        self._traci_manager = traci_manager
        # Bind to THIS manager's own TraCI connection when it has one.
        # The bound object exposes exactly the same domain API
        # (vehicle/simulation/trafficlight/...) as the traci module
        # itself, so every read below is unchanged in form - only which
        # SUMO process answers differs.
        self._traci = (
            traci_manager.connection
            if getattr(traci_manager, "connection", None) is not None
            else traci
        )
        # Phase clock for SignalState.seconds_in_current_phase: the
        # phase index last observed and the simulation time at which it
        # was first seen. None until the first read. This is the one
        # piece of state this adapter keeps between ticks, and it is
        # still only observation - it records WHEN the light changed,
        # it never decides anything about it.
        self._observed_phase_index = None
        self._observed_phase_started_at = 0.0

    def get_current_state(self) -> SimulationState:
        """
        Return a single, complete snapshot of the current simulation
        state as a SimulationState: vehicles and the traffic signal,
        the complete current state of the intersection, not vehicles
        alone.

        Raises
        ------
        RuntimeError
            If the TraCIManager this adapter was constructed with does
            not currently have an active connection.

        Returns
        -------
        SimulationState
        """
        if not self._traci_manager.is_connected:
            raise RuntimeError(
                "TrafficAdapter cannot read simulation state: the "
                "TraCIManager is not currently connected."
            )

        simulation_time = self._traci.simulation.getTime()

        vehicle_ids = self._traci.vehicle.getIDList()
        vehicles: List[VehicleState] = [
            self._extract_vehicle(vehicle_id) for vehicle_id in vehicle_ids
        ]

        signal = self._extract_signal(simulation_time)

        return SimulationState(
            simulation_time=simulation_time,
            vehicles=vehicles,
            signal=signal,
        )

    def get_departed_vehicle_ids(self) -> Tuple[str, ...]:
        """
        Return the IDs of vehicles that entered the network during the
        most recent simulation step, as a tuple.

        Exists so Performance Evaluation can measure throughput (unique
        vehicles served over a run) and per-vehicle travel time (a
        vehicle's departure timestamp starts its trip clock) without
        breaking this module's boundary rule: nothing outside
        TrafficAdapter calls traci directly, consumers ask this adapter
        for the raw fact instead. Deliberately returns raw departure
        facts only - what they mean is the consumer's decision.
        """
        if not self._traci_manager.is_connected:
            raise RuntimeError(
                "TrafficAdapter cannot read departed vehicles: the "
                "TraCIManager is not currently connected."
            )
        return tuple(self._traci.simulation.getDepartedIDList())

    def get_arrived_vehicle_ids(self) -> Tuple[str, ...]:
        """
        Return the IDs of vehicles that EXITED the network during the
        most recent simulation step, as a tuple.

        The arrival-side counterpart of get_departed_vehicle_ids():
        pairing a vehicle's departure time with its arrival time is what
        makes per-vehicle travel time measurable, one of the six core
        Performance Evaluation metrics. Same boundary rule as its
        sibling: raw facts only, interpretation lives downstream.
        """
        if not self._traci_manager.is_connected:
            raise RuntimeError(
                "TrafficAdapter cannot read arrived vehicles: the "
                "TraCIManager is not currently connected."
            )
        return tuple(self._traci.simulation.getArrivedIDList())

    def get_stop_starting_vehicle_ids(self) -> Tuple[str, ...]:
        """
        Return the IDs of vehicles that BEGAN a scheduled stop (a
        <stop> element in their route - a bus at a bus stop, a stalled
        truck in the accident scenario) during the most recent
        simulation step, as a tuple.

        Exists so Performance Evaluation can keep a vehicle's scheduled
        stop time out of its measured travel time - the same convention
        SUMO itself applies to waiting time, which never counts a
        scheduled stop as delay. Raw fact only, like every read here:
        what to subtract, and from what, is MetricsCollector's business.
        """
        if not self._traci_manager.is_connected:
            raise RuntimeError(
                "TrafficAdapter cannot read stop-starting vehicles: the "
                "TraCIManager is not currently connected."
            )
        return tuple(self._traci.simulation.getStopStartingVehiclesIDList())

    def get_stop_ending_vehicle_ids(self) -> Tuple[str, ...]:
        """
        Return the IDs of vehicles that ENDED a scheduled stop during the
        most recent simulation step, as a tuple. Counterpart of
        get_stop_starting_vehicle_ids().
        """
        if not self._traci_manager.is_connected:
            raise RuntimeError(
                "TrafficAdapter cannot read stop-ending vehicles: the "
                "TraCIManager is not currently connected."
            )
        return tuple(self._traci.simulation.getStopEndingVehiclesIDList())

    def get_emergency_vehicle_lanes(self) -> frozenset:
        """
        Return the set of lane IDs that currently hold at least one
        EMERGENCY-class vehicle, as a frozenset.

        Detection is deliberately a raw-fact read, exactly like every
        other method here: which SUMO vehicle classes count as
        emergencies and what to DO about them are decisions that belong
        to callers (app.py passes the result straight into
        DecisionEngine.decide()'s emergency_lanes parameter). No
        prioritization logic lives in this adapter.
        """
        if not self._traci_manager.is_connected:
            raise RuntimeError(
                "TrafficAdapter cannot read emergency vehicles: the "
                "TraCIManager is not currently connected."
            )
        emergency_lanes = set()
        for vehicle_id in self._traci.vehicle.getIDList():
            if self._traci.vehicle.getVehicleClass(vehicle_id) == "emergency":
                lane_id = self._traci.vehicle.getLaneID(vehicle_id)
                if lane_id:
                    emergency_lanes.add(lane_id)
        return frozenset(emergency_lanes)

    def _extract_vehicle(self, vehicle_id: str) -> VehicleState:
        """
        Read every required raw attribute for a single vehicle exactly
        once, and return it as a VehicleState.
        """
        return VehicleState(
            id=vehicle_id,
            lane_id=self._traci.vehicle.getLaneID(vehicle_id),
            speed=self._traci.vehicle.getSpeed(vehicle_id),
            waiting_time=self._traci.vehicle.getWaitingTime(vehicle_id),
            position=self._traci.vehicle.getPosition(vehicle_id),
            # One extra TraCI read per vehicle per tick. Worth it: it is
            # what lets the dashboard draw a bus as a bus and a
            # motorcycle as a motorcycle instead of every vehicle as an
            # identical box. Still a raw fact, like everything else here
            # - what a type MEANS is the caller's business.
            type_id=self._traci.vehicle.getTypeID(vehicle_id),
        )

    def _extract_signal(self, simulation_time: float) -> SignalState:
        """
        Read the current traffic signal state and return it as a
        SignalState.

        lane_states is built by querying traci.trafficlight.
        getControlledLinks() live, rather than relying on a hardcoded
        lane-order list duplicated from ml.feature_schema. That schema's
        lane list exists for a different reason (a stable ML input
        contract) and duplicating it here for a different purpose would
        be two independently maintained copies of the same fact, this
        method stays correct even if the network were ever swapped out
        entirely.
        """
        raw_state = self._traci.trafficlight.getRedYellowGreenState(_TLS_ID)
        current_phase_index = self._traci.trafficlight.getPhase(_TLS_ID)
        seconds_until_next_switch = (
            self._traci.trafficlight.getNextSwitch(_TLS_ID) - simulation_time
        )
        lane_states = self._build_lane_states(raw_state)

        if current_phase_index != self._observed_phase_index:
            if self._observed_phase_index is None:
                # First ever read. The phase may already be part-way
                # through (a run resumed from a saved state, or an
                # adapter attached mid-run), so recover the elapsed time
                # from SUMO's own clock: duration - remaining. Exact
                # under the static program; under an adaptive controller
                # that re-arms its ceiling every tick this comes out as
                # ~0, which is the right answer for "just attached".
                phase_duration = self._traci.trafficlight.getPhaseDuration(_TLS_ID)
                already_elapsed = max(0.0, phase_duration - seconds_until_next_switch)
                self._observed_phase_started_at = simulation_time - already_elapsed
            else:
                self._observed_phase_started_at = simulation_time
            self._observed_phase_index = current_phase_index
        seconds_in_current_phase = max(
            0.0, simulation_time - self._observed_phase_started_at
        )

        return SignalState(
            tls_id=_TLS_ID,
            raw_state=raw_state,
            current_phase_index=current_phase_index,
            seconds_until_next_switch=seconds_until_next_switch,
            lane_states=lane_states,
            seconds_in_current_phase=seconds_in_current_phase,
        )

    def _build_lane_states(self, raw_state: str):
        """
        Cross-reference getControlledLinks() (one entry per controlled
        link index, each describing which lane that link connects from)
        against raw_state (one character per link index, in the same
        order) to build a lane_id -> single-character-state mapping.

        A lane can control more than one link (this network's channelized
        lanes each control exactly one, but this stays correct even if a
        future network shares a lane across two movements), in that case
        the lane's first controlling link's state wins, consistent with
        how this network is actually designed (one movement per lane).

        Returns a MappingProxyType so the resulting SignalState.lane_states
        can never be mutated after this method returns, consistent with
        every other read-only mapping in this project.
        """
        controlled_links = self._traci.trafficlight.getControlledLinks(_TLS_ID)

        lane_states: Dict[str, str] = {}
        for link_index, connections in enumerate(controlled_links):
            if not connections:
                continue
            incoming_lane_id = connections[0][0]
            if incoming_lane_id not in lane_states:
                lane_states[incoming_lane_id] = raw_state[link_index]

        return MappingProxyType(lane_states)