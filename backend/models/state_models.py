"""
state_models.py
================
Strongly typed, immutable data contracts describing raw simulation state.

These replace the plain dictionaries TrafficAdapter previously returned.
No calculation, interpretation, or derived field lives here, these
classes are pure data containers describing exactly what TraCI reported,
nothing more. Density, congestion, and any other derived state belong to
the Digital Twin and Feature Extraction layers, not here.

Both classes are declared frozen so that once a snapshot is created, it
cannot be silently mutated by a later layer in the pipeline, a snapshot
representing "what SUMO reported at time T" should never change after
the fact.
"""

from dataclasses import dataclass
from typing import List, Tuple


@dataclass(frozen=True)
class VehicleState:
    """
    Raw, per-vehicle state for a single simulation step, exactly as
    reported by TraCI, with no derived or computed fields.

    Attributes
    ----------
    id : str
        The SUMO vehicle ID, as returned by traci.vehicle.getIDList().
    lane_id : str
        The ID of the lane the vehicle currently occupies.
    speed : float
        The vehicle's current speed, in metres per second.
    waiting_time : float
        Accumulated waiting time for this vehicle, in seconds, as
        reported by traci.vehicle.getWaitingTime().
    position : Tuple[float, float]
        The vehicle's (x, y) coordinate in the network's local
        coordinate system, as reported by traci.vehicle.getPosition().
    """

    id: str
    lane_id: str
    speed: float
    waiting_time: float
    position: Tuple[float, float]


@dataclass(frozen=True)
class SimulationState:
    """
    A single, complete snapshot of raw simulation state at one point in
    time.

    Attributes
    ----------
    simulation_time : float
        The current SUMO simulation time, in seconds, as reported by
        traci.simulation.getTime().
    vehicles : List[VehicleState]
        One VehicleState per vehicle currently present in the
        simulation. Empty list if no vehicles are present at this step.
    """

    simulation_time: float
    vehicles: List[VehicleState]