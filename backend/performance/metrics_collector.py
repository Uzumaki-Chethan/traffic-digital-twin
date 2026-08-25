"""
metrics_collector.py
====================
The measurement backbone of Performance Evaluation. One MetricsCollector
instance is attached to ONE simulation (AI or baseline) and folds a
SimulationState snapshot into running aggregates once per simulation
step. It computes the six core metric families:

  1. Average waiting time   - time-weighted mean, across every vehicle
                              present, of its accumulated waiting time.
  2. Queue length           - vehicles below the stopped threshold
                              (SUMO's own halting definition), tracked
                              network-wide AND per lane.
  3. Throughput             - unique vehicles that completed their trip
                              (exited the network), normalized to
                              vehicles/hour over the measured duration.
  4. Average speed          - time-weighted mean speed of all vehicles
                              present.
  5. Stopped vehicles       - same raw count as queue length, reported
                              separately as an instantaneous severity
                              figure (mean + worst observed).
  6. Travel time            - per-vehicle entry->exit duration, paired
                              from adapter-reported departure and
                              arrival timestamps.

WHY TIME-WEIGHTED INTEGRALS: a plain mean over per-step snapshots
over-weights periods with denser sampling and under-weights long
stretches. Every sample here contributes value * dt (the simulated
seconds it represents), so each metric is an integral over simulated
time divided by total simulated time - correct regardless of step
length or sampling cadence.

WHY SIMULATIONSTATE (not TrafficFeatures): both the AI simulation and
the baseline must be measured through the IDENTICAL collection path so
no engineered-feature difference can bias the comparison. The baseline
runs no DigitalTwin/FeatureEngineer at all, so the collector consumes
the raw adapter snapshot directly - the same object type on both sides.

This class contains no TraCI calls and no control logic - it is a pure
aggregator over facts handed to record() by the evaluation runner.
"""

from collections import defaultdict
from typing import Dict, Iterable


# SUMO's own definition of a halting/stopped vehicle; reusing it keeps
# our "queue length" and "stopped vehicles" numbers directly comparable
# with SUMO's built-in statistics.
STOPPED_SPEED_THRESHOLD_MPS = 0.1


class MetricsCollector:
    """
    Accumulates one simulation run's metrics. One instance per
    simulation; call record() once per simulation step and read
    summary() once the run has finished.
    """

    def __init__(self):
        self._last_time = None
        self._measured_duration_seconds = 0.0

        # Time-weighted integrals (value * dt accumulated per step).
        self._wait_time_integral = 0.0
        self._speed_integral = 0.0
        self._queue_integral = 0.0
        self._per_lane_queue_integrals = defaultdict(float)

        # Instantaneous extremes observed at any point in the run.
        self._max_queue_length = 0
        self._max_avg_waiting_time = 0.0

        # Per-vehicle trip tracking for travel time + throughput.
        self._depart_times: Dict[str, float] = {}
        self._arrive_times: Dict[str, float] = {}
        # First-seen timestamps as a fallback depart time for vehicles
        # already in the network at the very first recorded step.
        self._first_seen_times: Dict[str, float] = {}

        self._sample_count = 0

    def record(
        self,
        state,
        departed_vehicle_ids: Iterable[str] = (),
        arrived_vehicle_ids: Iterable[str] = (),
    ) -> None:
        """
        Fold one SimulationState snapshot into the running aggregates.

        state : SimulationState
            Raw adapter snapshot for this step (both simulations use
            this identical path).
        departed_vehicle_ids : iterable of str
            IDs that entered the network this step
            (TrafficAdapter.get_departed_vehicle_ids()).
        arrived_vehicle_ids : iterable of str
            IDs that exited the network this step
            (TrafficAdapter.get_arrived_vehicle_ids()).
        """
        now = state.simulation_time
        dt = (
            0.0 if self._last_time is None
            else max(0.0, now - self._last_time)
        )

        vehicles = state.vehicles
        n_present = len(vehicles)

        if n_present > 0:
            mean_wait = sum(v.waiting_time for v in vehicles) / n_present
            mean_speed = sum(v.speed for v in vehicles) / n_present
            if mean_wait > self._max_avg_waiting_time:
                self._max_avg_waiting_time = mean_wait
            if dt > 0.0:
                self._wait_time_integral += mean_wait * dt
                self._speed_integral += mean_speed * dt
            for v in vehicles:
                if v.id not in self._first_seen_times:
                    self._first_seen_times[v.id] = now

        # Queue length / stopped vehicles: SUMO's halting threshold.
        stopped_by_lane: Dict[str, int] = defaultdict(int)
        queue_length = 0
        for v in vehicles:
            if v.speed < STOPPED_SPEED_THRESHOLD_MPS:
                queue_length += 1
                stopped_by_lane[v.lane_id] += 1

        if queue_length > self._max_queue_length:
            self._max_queue_length = queue_length
        if dt > 0.0:
            self._queue_integral += queue_length * dt
            for lane_id, count in stopped_by_lane.items():
                self._per_lane_queue_integrals[lane_id] += count * dt

        # Trip clocks: departure starts them, arrival stops them.
        for vehicle_id in departed_vehicle_ids:
            self._depart_times.setdefault(vehicle_id, now)
        for vehicle_id in arrived_vehicle_ids:
            # A vehicle could theoretically arrive within the same step
            # window we first observe it; first-seen keeps the clock
            # well-defined either way.
            self._depart_times.setdefault(
                vehicle_id, self._first_seen_times.get(vehicle_id, now)
            )
            self._arrive_times[vehicle_id] = now

        self._measured_duration_seconds += dt
        self._last_time = now
        self._sample_count += 1

    def summary(self) -> Dict[str, object]:
        """
        Final metrics for the run. Call only after the last record();
        values are undefined mid-run by design (no partial-run numbers
        to misread in a report).

        Returns a dict of scalar metrics plus one nested dict,
        "avg_queue_length_per_lane", for the per-lane breakdown.
        """
        duration = self._measured_duration_seconds
        throughput_vehicles = len(self._arrive_times)

        travel_times = [
            arrival - self._depart_times.get(vehicle_id, arrival)
            for vehicle_id, arrival in self._arrive_times.items()
        ]
        avg_travel_time = (
            sum(travel_times) / len(travel_times) if travel_times else 0.0
        )
        max_travel_time = max(travel_times) if travel_times else 0.0

        return {
            # 1. Waiting time
            "avg_waiting_time_seconds": (
                self._wait_time_integral / duration if duration > 0.0 else 0.0
            ),
            "max_avg_waiting_time_seconds": self._max_avg_waiting_time,
            # 2. Queue length (network-wide + per lane)
            "avg_queue_length_vehicles": (
                self._queue_integral / duration if duration > 0.0 else 0.0
            ),
            "max_queue_length_vehicles": float(self._max_queue_length),
            "avg_queue_length_per_lane": {
                lane_id: (integral / duration if duration > 0.0 else 0.0)
                for lane_id, integral in self._per_lane_queue_integrals.items()
            },
            # 3. Throughput
            "throughput_vehicles": float(throughput_vehicles),
            "throughput_veh_per_hour": (
                throughput_vehicles / duration * 3600.0
                if duration > 0.0 else 0.0
            ),
            # 4. Speed
            "avg_speed_mps": (
                self._speed_integral / duration if duration > 0.0 else 0.0
            ),
            # 5. Stopped vehicles (instantaneous severity extremes)
            "max_stopped_vehicles": float(self._max_queue_length),
            # 6. Travel time (completed trips only)
            "avg_travel_time_seconds": avg_travel_time,
            "max_travel_time_seconds": max_travel_time,
            "completed_trips": float(len(travel_times)),
            # Run bookkeeping
            "simulation_duration_seconds": duration,
            "sample_count": float(self._sample_count),
        }