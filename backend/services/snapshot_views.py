"""
snapshot_views.py
==================
The dashboard snapshot, one view builder per part, as pure functions
over the raw SimulationState / TrafficFeatures / Decision objects.

Two publishers use them: simulation_runner.py for a demo run, and
performance/evaluator.py for EACH side of a live evaluation (the AI and
the baseline). One implementation, so a JunctionPlate fed from
`snapshot.ai` draws exactly what it draws from a demo snapshot - and so
the view can only ever change in one place.

Nothing here reads traci, decides anything, or holds state.
"""

from decision_engine.decision_engine import ALL_APPROACH_LANES
from signal_controller.signal_controller import PHASE_TO_INDEX

_INDEX_TO_PHASE = {idx: name for name, idx in PHASE_TO_INDEX.items()}


def signal_view(state):
    """
    Current phase name, whether SUMO is mid-yellow, and the countdown to
    the next switch (a real countdown only during amber - see
    frontend/README.md).
    """
    idx = state.signal.current_phase_index
    if idx in _INDEX_TO_PHASE:
        return {
            "phase": _INDEX_TO_PHASE[idx],
            "is_yellow": False,
            "green": True,
            "countdown": max(0.0, state.signal.seconds_until_next_switch),
        }
    prev_green = _INDEX_TO_PHASE.get(idx - 1, "unknown")
    return {
        "phase": prev_green,
        "is_yellow": True,
        "green": False,
        "countdown": max(0.0, state.signal.seconds_until_next_switch),
    }


def metrics_view(features):
    return {
        "vehicles": features.total_vehicle_count,
        "avg_speed": features.average_speed,
        "avg_wait": features.average_waiting_time,
        "queue": features.stopped_vehicle_count,
        "stopped": features.stopped_vehicle_count,
    }


def lanes_view(features, lane_scores, lane_states):
    """
    One row per approach lane, in ALL_APPROACH_LANES order. `score` is the
    per-lane urgency the DecisionEngine computed this tick (the same
    number persisted to lane_state_log), never recomputed here; rounded
    because it is a 0-1 shade on screen.
    """
    rows = []
    for lane_id in ALL_APPROACH_LANES:
        lane = features.lane_features.get(lane_id)
        rows.append({
            "lane_id": lane_id,
            "vehicles": lane.vehicle_count if lane is not None else 0,
            "avg_wait": lane.average_waiting_time if lane is not None else 0.0,
            "score": round(lane_scores.get(lane_id, 0.0), 4),
            "signal": lane_states.get(lane_id, "r"),
        })
    return rows


# Simulated seconds between the light "motion frames" published between
# decision ticks, so the dashboard sees vehicle positions five times a
# second at 1x rather than once. A car turning through the junction at
# 8 m/s moves ~1.6 m per frame instead of 8 m, so the straight tween
# between two frames stays on the arc instead of cutting 0.6 m inside
# it - which is what put left-turners over the kerb line.
MOTION_FRAME_INTERVAL_SECONDS = 0.2


def motion_frame(tick_snapshot: dict, sim_time: float, vehicles_by_side: dict) -> dict:
    """
    The last decision-tick snapshot with fresh time and vehicle
    positions, marked `tick: False` so the frontend's per-tick histories
    ignore it. `vehicles_by_side` is {None: vehicles} for a demo frame or
    {"ai": ..., "baseline": ...} for an evaluation frame. The decision's
    held-seconds are advanced by the elapsed time so the phase clock the
    plate keys its release on (sim_time - duration) does not move.
    """
    elapsed = sim_time - tick_snapshot["sim_time"]
    frame = dict(tick_snapshot)
    frame["sim_time"] = sim_time
    frame["tick"] = False
    for side, vehicles in vehicles_by_side.items():
        target = frame if side is None else dict(frame[side])
        target["vehicles"] = vehicles_view_from(vehicles)
        decision = dict(target["decision"])
        decision["duration"] = round(decision["duration"] + elapsed, 2)
        target["decision"] = decision
        if side is not None:
            frame[side] = target
    return frame


def vehicles_view(state):
    """Per-vehicle positions for a SimulationState (see vehicles_view_from)."""
    return vehicles_view_from(state.vehicles)


def vehicles_view_from(vehicles):
    """
    Per-vehicle positions straight from TrafficAdapter's VehicleState (a
    real traci.vehicle.getPosition() reading in network metres), rounded
    to centimetres. The type id lets the frontend draw a bus as a bus;
    its dimensions live in the frozen vehicle_types.add.xml, held on the
    frontend rather than sent every tick.
    """
    return [
        {
            "id": v.id,
            "lane": v.lane_id,
            "x": round(v.position[0], 2),
            "y": round(v.position[1], 2),
            "speed": round(v.speed, 2),
            "type": v.type_id,
            # SUMO's heading, degrees clockwise from north.
            "angle": round(getattr(v, "angle", 0.0), 1),
        }
        for v in vehicles
    ]


def decision_view(decision):
    return {
        "active_phase": decision.active_phase,
        "mode": decision.decision_mode,
        "switched": decision.switched,
        "reason": decision.reason_text,
        "duration": decision.green_duration_seconds,
        "phase_scores": dict(decision.phase_scores),
        # The decision boundary (see Decision.switch_margin); 0 for a
        # baseline controller, which has none.
        "margin": round(float(getattr(decision, "switch_margin", 0.0)), 4),
    }


def side_view(state, features, decision, lane_states, phase_history, emergency_lanes=frozenset()):
    """
    Everything one controller's junction needs drawing: what an
    evaluation snapshot carries under `ai` and under `baseline`. No
    prediction - the baseline has none, and the Performance page shows
    the model nowhere. `emergency_lanes` is what that side's engine was
    told (the AI's detection; the baseline is never told, and sends []).
    """
    return {
        "signal": signal_view(state),
        "metrics": metrics_view(features),
        "lanes": lanes_view(features, decision.lane_scores, lane_states),
        "vehicles": vehicles_view(state),
        "decision": decision_view(decision),
        "emergency_lanes": sorted(emergency_lanes),
        "phase_history": list(phase_history),
    }
