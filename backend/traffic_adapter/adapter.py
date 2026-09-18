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
import traci.constants as tc

from models import SignalState, SimulationState, VehicleState

logger = logging.getLogger(__name__)

# This is the only traffic light this frozen, single-junction network
# has. Multi-junction support later means iterating over
# traci.trafficlight.getIDList() instead of hardcoding this, deliberately
# not built now, see the design review's note on deferred multi-junction
# support.
_TLS_ID = "C"

# What is read per vehicle per step, as ONE TraCI subscription rather
# than five round trips (2026-09-14). Profiled on a 60 s extreme run:
# 445,256 round trips, one per variable per vehicle per 0.05 s step -
# ~7,400 per simulated second on ONE side - which is what held the
# evaluation (two sides) at ~0.5x real time on a laptop. A subscription
# makes SUMO deliver every subscribed variable for every subscribed
# vehicle in the simulationStep() reply, so the per-step cost is one
# getAllSubscriptionResults() call. Values are byte-identical to the
# direct reads they replace; the only difference is who asks.
_VEHICLE_VARS = (
    tc.VAR_LANE_ID, tc.VAR_SPEED, tc.VAR_WAITING_TIME, tc.VAR_POSITION, tc.VAR_ANGLE,
)
# Static for a vehicle's whole life: read once when it is first seen and
# remembered, never subscribed - SUMO delivers a subscription every step
# whether or not it is read, so every variable in it is parsing cost
# twenty times a second.
_VEHICLE_STATIC_VARS = (tc.VAR_TYPE, tc.VAR_VEHICLECLASS)
_TLS_VARS = (
    tc.TL_RED_YELLOW_GREEN_STATE, tc.TL_CURRENT_PHASE,
    tc.TL_NEXT_SWITCH, tc.TL_PHASE_DURATION,
)
# The per-step event lists SUMO only reports for the LAST step. A caller
# that reads state once per decision tick (1 Hz - see observe_step) would
# miss 19 of every 20 steps' departures, arrivals and stops, so the
# adapter watches every step for these through one simulation-domain
# subscription and hands over what accumulated since the caller last
# asked. Tiny payloads: a handful of ids per step.
_SIM_EVENT_VARS = (
    tc.VAR_DEPARTED_VEHICLES_IDS, tc.VAR_ARRIVED_VEHICLES_IDS,
    tc.VAR_STOP_STARTING_VEHICLES_IDS, tc.VAR_STOP_ENDING_VEHICLES_IDS,
)


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
        # Subscription bookkeeping (see _VEHICLE_VARS). A vehicle is read
        # directly on the one step it first appears - its subscription
        # only reports from the NEXT step - and from its subscription
        # after that. _last_vehicle_results is the most recent step's
        # results, which get_emergency_vehicle_lanes() reads instead of
        # asking SUMO again.
        self._subscribed_vehicles = set()
        self._static_by_vehicle = {}
        self._last_vehicle_results = {}
        self._tls_subscribed = False
        self._controlled_links = None
        # Event accumulation between reads (see observe_step / _SIM_EVENT_VARS).
        self._observing = False
        self._pending_events = {var: [] for var in _SIM_EVENT_VARS}

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

        results = self._vehicle_results()
        vehicles: List[VehicleState] = [
            VehicleState(
                id=vehicle_id,
                lane_id=r[tc.VAR_LANE_ID],
                speed=r[tc.VAR_SPEED],
                waiting_time=r[tc.VAR_WAITING_TIME],
                position=tuple(r[tc.VAR_POSITION]),
                type_id=r[tc.VAR_TYPE],
                angle=float(r.get(tc.VAR_ANGLE, 0.0)),
            )
            for vehicle_id, r in results.items()
        ]

        signal = self._extract_signal(simulation_time)

        return SimulationState(
            simulation_time=simulation_time,
            vehicles=vehicles,
            signal=signal,
        )

    def get_simulation_time(self) -> float:
        """Current simulated time, seconds - one round trip."""
        return float(self._traci.simulation.getTime())

    def get_vehicles(self) -> List[VehicleState]:
        """
        The fleet alone - every vehicle's lane, speed, wait, position and
        type - without the signal or a SimulationState round it. For the
        dashboard's motion frames between decision ticks: SUMO delivers
        the subscribed variables inside every step's reply anyway, so
        this costs the id list and one results call, and nothing
        downstream (twin, features, engine) sees it.
        """
        if not self._traci_manager.is_connected:
            raise RuntimeError(
                "TrafficAdapter cannot read vehicles: the TraCIManager is "
                "not currently connected."
            )
        return [
            VehicleState(
                id=vehicle_id,
                lane_id=r[tc.VAR_LANE_ID],
                speed=r[tc.VAR_SPEED],
                waiting_time=r[tc.VAR_WAITING_TIME],
                position=tuple(r[tc.VAR_POSITION]),
                type_id=r[tc.VAR_TYPE],
                angle=float(r.get(tc.VAR_ANGLE, 0.0)),
            )
            for vehicle_id, r in self._vehicle_results().items()
        ]

    def observe_step(self) -> None:
        """
        Call once after EVERY simulation step when state itself is read
        less often than every step (the runner and the evaluator read at
        the 1 Hz decision cadence). Collects this step's departed /
        arrived / stop-starting / stop-ending vehicle ids into the pending
        lists that get_departed_vehicle_ids() and its siblings then
        return and clear. One subscription result read per step; no
        per-vehicle traffic. Without this having been called, those
        getters fall back to SUMO's last-step-only answer, exactly as
        before 2026-09-14.
        """
        simulation = self._traci.simulation
        if not self._observing:
            subscribe = getattr(simulation, "subscribe", None)
            if subscribe is None:
                return
            subscribe(_SIM_EVENT_VARS)
            self._observing = True
            # The subscription reports from the next step; this step's
            # lists are read directly so nothing is lost at the seam.
            self._pending_events[tc.VAR_DEPARTED_VEHICLES_IDS].extend(simulation.getDepartedIDList())
            self._pending_events[tc.VAR_ARRIVED_VEHICLES_IDS].extend(simulation.getArrivedIDList())
            self._pending_events[tc.VAR_STOP_STARTING_VEHICLES_IDS].extend(simulation.getStopStartingVehiclesIDList())
            self._pending_events[tc.VAR_STOP_ENDING_VEHICLES_IDS].extend(simulation.getStopEndingVehiclesIDList())
            return
        results = simulation.getSubscriptionResults()
        if not results:
            return
        for var in _SIM_EVENT_VARS:
            ids = results.get(var)
            if ids:
                self._pending_events[var].extend(ids)

    def _take_events(self, var, direct):
        """Accumulated ids for `var` if observing (and clear them), else SUMO's last step."""
        if self._observing:
            ids = tuple(self._pending_events[var])
            self._pending_events[var] = []
            return ids
        return tuple(direct())

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
        return self._take_events(tc.VAR_DEPARTED_VEHICLES_IDS, self._traci.simulation.getDepartedIDList)

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
        return self._take_events(tc.VAR_ARRIVED_VEHICLES_IDS, self._traci.simulation.getArrivedIDList)

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
        return self._take_events(tc.VAR_STOP_STARTING_VEHICLES_IDS, self._traci.simulation.getStopStartingVehiclesIDList)

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
        return self._take_events(tc.VAR_STOP_ENDING_VEHICLES_IDS, self._traci.simulation.getStopEndingVehiclesIDList)

    def add_vehicle(self, vehicle_id: str, route_id: str, type_id: str) -> None:
        """
        Put one vehicle of `type_id` onto `route_id` now, at the route's
        entry, on the lane that best fits the route (SUMO's "best"). The
        one write to the traffic this adapter performs, for the console's
        emergency dispatch; the signal is still only ever written by the
        SignalController. Raises traci's TraCIException for an unknown
        route or type - the caller validated both, so that is a bug.
        """
        if not self._traci_manager.is_connected:
            raise RuntimeError("TrafficAdapter cannot add a vehicle: not connected.")
        self._traci.vehicle.add(
            vehicle_id, route_id, typeID=type_id,
            depart="now", departLane="best", departSpeed="max",
        )

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
        # Served from the last get_current_state() step's subscription
        # results (vehicle class is subscribed alongside the rest), so
        # this costs no round trips at all. Falls back to asking SUMO if
        # nothing has been read yet.
        results = self._last_vehicle_results
        if not results:
            results = {
                vehicle_id: self._read_vehicle_directly(vehicle_id)
                for vehicle_id in self._traci.vehicle.getIDList()
            }
        emergency_lanes = set()
        for r in results.values():
            if r.get(tc.VAR_VEHICLECLASS) == "emergency" and r.get(tc.VAR_LANE_ID):
                emergency_lanes.add(r[tc.VAR_LANE_ID])
        return frozenset(emergency_lanes)

    def _vehicle_results(self) -> dict:
        """
        This step's raw variables for every vehicle on the network, keyed
        by vehicle id: {vehicle_id: {tc.VAR_*: value}}.

        Two round trips for the whole fleet - the id list and the
        subscription results - plus, for a vehicle seen for the first
        time this step, one subscribe and one direct read of each
        variable (a subscription delivers from the next step on). The id
        list is the authority, not the departed list: a run resumed from
        a saved state starts with vehicles that never "departed".
        """
        vehicle = self._traci.vehicle
        ids = vehicle.getIDList()
        subscribed = vehicle.getAllSubscriptionResults() if self._subscribed_vehicles else {}
        results = {}
        for vehicle_id in ids:
            r = subscribed.get(vehicle_id)
            if r is None or any(var not in r for var in _VEHICLE_VARS):
                r = self._read_vehicle_directly(vehicle_id)
                if vehicle_id not in self._subscribed_vehicles:
                    vehicle.subscribe(vehicle_id, _VEHICLE_VARS)
                    self._subscribed_vehicles.add(vehicle_id)
            else:
                r = dict(r)
                r.update(self._static_by_vehicle[vehicle_id])
            results[vehicle_id] = r
        # Vehicles that left the network drop out of the results on their
        # own; keep the bookkeeping from growing with them.
        if len(self._subscribed_vehicles) > 2 * len(results) + 64:
            self._subscribed_vehicles &= set(results)
            self._static_by_vehicle = {k: v for k, v in self._static_by_vehicle.items() if k in results}
        self._last_vehicle_results = results
        return results

    def _read_vehicle_directly(self, vehicle_id: str) -> dict:
        """The five reads a subscription replaces, for a vehicle's first step."""
        vehicle = self._traci.vehicle
        static = self._static_by_vehicle.get(vehicle_id)
        if static is None:
            static = {
                tc.VAR_TYPE: vehicle.getTypeID(vehicle_id),
                tc.VAR_VEHICLECLASS: vehicle.getVehicleClass(vehicle_id),
            }
            self._static_by_vehicle[vehicle_id] = static
        return {
            tc.VAR_LANE_ID: vehicle.getLaneID(vehicle_id),
            tc.VAR_SPEED: vehicle.getSpeed(vehicle_id),
            tc.VAR_WAITING_TIME: vehicle.getWaitingTime(vehicle_id),
            tc.VAR_POSITION: vehicle.getPosition(vehicle_id),
            tc.VAR_ANGLE: vehicle.getAngle(vehicle_id),
            **static,
        }

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
        tls = self._tls_results()
        if tls is not None:
            raw_state = tls[tc.TL_RED_YELLOW_GREEN_STATE]
            current_phase_index = tls[tc.TL_CURRENT_PHASE]
            seconds_until_next_switch = tls[tc.TL_NEXT_SWITCH] - simulation_time
        else:
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
                phase_duration = (
                    tls[tc.TL_PHASE_DURATION] if tls is not None
                    else self._traci.trafficlight.getPhaseDuration(_TLS_ID)
                )
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

    def _tls_results(self):
        """
        The signal's subscribed variables for this step, or None when
        subscriptions are unavailable (a test's fake connection) or on the
        very first read, when the subscription has just been placed and
        reports from the next step - the caller then reads directly.
        """
        trafficlight = self._traci.trafficlight
        subscribe = getattr(trafficlight, "subscribe", None)
        if subscribe is None:
            return None
        if not self._tls_subscribed:
            subscribe(_TLS_ID, _TLS_VARS)
            self._tls_subscribed = True
            return None
        results = trafficlight.getSubscriptionResults(_TLS_ID)
        if not results or any(var not in results for var in _TLS_VARS):
            return None
        return results

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
        # The link table is a property of the network, not of the step:
        # read once per connection, not once per 0.05 s.
        if self._controlled_links is None:
            self._controlled_links = self._traci.trafficlight.getControlledLinks(_TLS_ID)
        controlled_links = self._controlled_links

        lane_states: Dict[str, str] = {}
        for link_index, connections in enumerate(controlled_links):
            if not connections:
                continue
            incoming_lane_id = connections[0][0]
            if incoming_lane_id not in lane_states:
                lane_states[incoming_lane_id] = raw_state[link_index]

        return MappingProxyType(lane_states)