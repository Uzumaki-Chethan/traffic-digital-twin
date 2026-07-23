"""
adapter.py
==========
The Traffic Adapter, the single boundary between raw TraCI calls and the
rest of the project. No other module is permitted to import traci or
call traci.vehicle.* / traci.simulation.* / traci.edge.* / traci.lane.*
directly, everything downstream (Digital Twin, Feature Extraction,
Decision Engine) works only with the SimulationState and VehicleState
objects this class returns.

This module deliberately does no interpretation of the data it reads, no
density, no congestion classification, no averaging, no ML. It only
extracts current raw state, exactly as TraCI reports it, into strongly
typed, immutable dataclasses.
"""

import logging
from typing import List

import traci

from models import SimulationState, VehicleState

logger = logging.getLogger(__name__)


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
        state as a SimulationState.

        Raises
        ------
        RuntimeError
            If the TraCIManager this adapter was constructed with does
            not currently have an active connection. Checking this here,
            before any traci.* call is made, means a stale or unstarted
            connection fails with one clear message instead of a raw
            TraCI exception surfacing from deep inside this method.

        Returns
        -------
        SimulationState
            simulation_time is read once via traci.simulation.getTime().
            vehicles is a list of VehicleState, one per vehicle currently
            in the simulation, built by _extract_vehicle(). Empty list
            if no vehicles are present at this step.
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

        return SimulationState(
            simulation_time=simulation_time,
            vehicles=vehicles,
        )

    def _extract_vehicle(self, vehicle_id: str) -> VehicleState:
        """
        Read every required raw attribute for a single vehicle exactly
        once, and return it as a VehicleState. This is the only place in
        the project where these five TraCI getters are called, keeping
        get_current_state() itself free of repeated or scattered TraCI
        calls.

        Parameters
        ----------
        vehicle_id : str
            The SUMO vehicle ID, as returned by traci.vehicle.getIDList().

        Returns
        -------
        VehicleState
            position is stored exactly as TraCI reports it, no
            conversion or rounding applied.
        """
        return VehicleState(
            id=vehicle_id,
            lane_id=traci.vehicle.getLaneID(vehicle_id),
            speed=traci.vehicle.getSpeed(vehicle_id),
            waiting_time=traci.vehicle.getWaitingTime(vehicle_id),
            position=traci.vehicle.getPosition(vehicle_id),
        )