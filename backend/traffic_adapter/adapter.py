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
"""

import logging
from types import MappingProxyType
from typing import Dict, List

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

        simulation_time = traci.simulation.getTime()

        vehicle_ids = traci.vehicle.getIDList()
        vehicles: List[VehicleState] = [
            self._extract_vehicle(vehicle_id) for vehicle_id in vehicle_ids
        ]

        signal = self._extract_signal(simulation_time)

        return SimulationState(
            simulation_time=simulation_time,
            vehicles=vehicles,
            signal=signal,
        )

    def _extract_vehicle(self, vehicle_id: str) -> VehicleState:
        """
        Read every required raw attribute for a single vehicle exactly
        once, and return it as a VehicleState.
        """
        return VehicleState(
            id=vehicle_id,
            lane_id=traci.vehicle.getLaneID(vehicle_id),
            speed=traci.vehicle.getSpeed(vehicle_id),
            waiting_time=traci.vehicle.getWaitingTime(vehicle_id),
            position=traci.vehicle.getPosition(vehicle_id),
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
        raw_state = traci.trafficlight.getRedYellowGreenState(_TLS_ID)
        current_phase_index = traci.trafficlight.getPhase(_TLS_ID)
        seconds_until_next_switch = (
            traci.trafficlight.getNextSwitch(_TLS_ID) - simulation_time
        )
        lane_states = self._build_lane_states(raw_state)

        return SignalState(
            tls_id=_TLS_ID,
            raw_state=raw_state,
            current_phase_index=current_phase_index,
            seconds_until_next_switch=seconds_until_next_switch,
            lane_states=lane_states,
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
        controlled_links = traci.trafficlight.getControlledLinks(_TLS_ID)

        lane_states: Dict[str, str] = {}
        for link_index, connections in enumerate(controlled_links):
            if not connections:
                continue
            incoming_lane_id = connections[0][0]
            if incoming_lane_id not in lane_states:
                lane_states[incoming_lane_id] = raw_state[link_index]

        return MappingProxyType(lane_states)