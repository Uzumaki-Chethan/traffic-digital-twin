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
from typing import List, Mapping, Tuple


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
    type_id : str
        The vehicle's SUMO type, as reported by
        traci.vehicle.getTypeID() - e.g. "car_normal", "motorcycle_
        aggressive", "auto_rickshaw", "bus", "truck", "ambulance". These
        are the types defined in sumo/vehicles/vehicle_types.add.xml.
        Defaults to "" so a VehicleState can still be built without one
        (tests, and any caller that predates this field).
    angle : float
        The vehicle's heading in SUMO's convention - degrees clockwise
        from north - as reported by traci.vehicle.getAngle(): the
        heading SUMO itself computed along the lane's real shape, so it
        turns smoothly through a junction's curve (2026-09-17). Read for
        the dashboard only; nothing in the pipeline uses it. Defaults to
        0.0 for callers that predate it.
    """

    id: str
    lane_id: str
    speed: float
    waiting_time: float
    position: Tuple[float, float]
    type_id: str = ""
    angle: float = 0.0


@dataclass(frozen=True)
class SignalState:
    """
    Raw traffic signal state for a single simulation step, exactly as
    reported by TraCI, with no derived or computed fields.

    This is the raw-tier counterpart to SignalFeatures (see
    feature_models.py), the same relationship VehicleState already has
    to LaneFeatures: this class is a complete, uninterpreted mirror of
    what TraCI reports, SignalFeatures is the small, selected subset of
    it that actually becomes an ML input.

    Attributes
    ----------
    tls_id : str
        The traffic light ID this state describes. Trivial with one
        junction today, kept explicit so multi-junction support later
        only means adding more SignalState instances, not restructuring
        this class.
    raw_state : str
        The full signal state string exactly as
        traci.trafficlight.getRedYellowGreenState(tls_id) returns it,
        for example "GGrGrrGGrGrr". Kept for debugging and for a future
        dashboard/explanation panel, not fed into the ML feature vector
        directly, see SignalFeatures for what actually is.
    current_phase_index : int
        The index of the currently active phase in the tlLogic program,
        as reported by traci.trafficlight.getPhase(tls_id). Captured for
        raw fidelity at this tier, deliberately NOT used as an ML
        feature, see the design review for why a phase index is a
        fragile, program-specific quantity to learn from.
    seconds_until_next_switch : float
        Seconds remaining until the signal's next phase change, computed
        as traci.trafficlight.getNextSwitch(tls_id) - the current
        simulation time. Only a real countdown under SUMO's own static
        program (or during a yellow clearance); under an adaptive
        controller it is whatever provisional ceiling that controller
        last armed. Kept for the dashboard's amber countdown, NOT used
        as an ML feature any more (see seconds_in_current_phase).
    seconds_in_current_phase : float
        Seconds the current phase index has been showing, measured by
        the adapter from the moment it observed the index change.
        Truthful under any controller, which is why it replaced
        seconds_until_next_switch as the ML feature on 2026-09-13.
    lane_states : Mapping[str, str]
        Per-lane single-character signal state ('G', 'g', 'y', or 'r'),
        keyed by lane_id, built by cross-referencing
        traci.trafficlight.getControlledLinks(tls_id) against raw_state.
        A read-only mapping (backed by types.MappingProxyType).
    """

    tls_id: str
    raw_state: str
    current_phase_index: int
    seconds_until_next_switch: float
    lane_states: Mapping[str, str]
    seconds_in_current_phase: float


@dataclass(frozen=True)
class SimulationState:
    """
    A single, complete snapshot of raw simulation state at one point in
    time: the full current state of the intersection, not vehicles
    alone.

    Attributes
    ----------
    simulation_time : float
        The current SUMO simulation time, in seconds, as reported by
        traci.simulation.getTime().
    vehicles : List[VehicleState]
        One VehicleState per vehicle currently present in the
        simulation. Empty list if no vehicles are present at this step.
    signal : SignalState
        The current raw traffic signal state. Required, not optional,
        every simulation step has a signal state, there is no
        meaningful "no signal" case for a signalized junction.
    """

    simulation_time: float
    vehicles: List[VehicleState]
    signal: SignalState