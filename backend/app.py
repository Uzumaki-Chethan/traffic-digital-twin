"""
app.py
======
Entry point for the TraCI communication layer. Wires Config, TraCIManager,
TrafficAdapter, DigitalTwin, FeatureEngineer, MLPredictor,
DecisionEngine, and SignalController together and guarantees the TraCI
connection is closed even if the simulation raises partway through, via
try/finally. This file intentionally contains no simulation logic of its
own - that all lives in the modules above; app.py only orchestrates
startup, run, shutdown, and the three read-only side-channels:

  1. SQLite persistence   (database.DatabaseLogger, 1 Hz inserts)
  2. Dashboard snapshots  (services.LiveStateStore -> FastAPI WS thread)
  3. Emergency detection  (adapter raw fact -> DecisionEngine input)

None of these can influence control: the database is a sink, the
dashboard server never receives commands, and emergency handling logic
lives entirely inside DecisionEngine.
"""

import logging
import os
from collections import deque

from config import Config
from traffic.traci_manager import TraCIManager
from traffic_adapter.adapter import TrafficAdapter
from digital_twin import DigitalTwin
from feature_engineering import FeatureEngineer
from ml import MLPredictor
from decision_engine.decision_engine import (
    DecisionEngine, PHASE_NAMES, ALL_APPROACH_LANES,
)
from signal_controller.signal_controller import SignalController, PHASE_TO_INDEX
from database import DatabaseLogger
from services.live_state import DEFAULT_STORE as LIVE_STATE
from services.dashboard_server import start_dashboard_server

# Inverse of SignalController.PHASE_TO_INDEX: green index -> phase name.
_INDEX_TO_PHASE = {idx: name for name, idx in PHASE_TO_INDEX.items()}


def _signal_view(state):
    """
    Build the dashboard's signal payload from a SimulationState's raw
    signal snapshot: current phase name, whether SUMO is mid-yellow,
    and the countdown to the next switch.
    """
    idx = state.signal.current_phase_index
    if idx in _INDEX_TO_PHASE:
        return {
            "phase": _INDEX_TO_PHASE[idx],
            "is_yellow": False,
            "green": True,
            "countdown": max(0.0, state.signal.seconds_until_next_switch),
        }
    # Odd index = yellow clearance out of the previous even (green) phase.
    prev_green = _INDEX_TO_PHASE.get(idx - 1, "unknown")
    return {
        "phase": prev_green,
        "is_yellow": True,
        "green": False,
        "countdown": max(0.0, state.signal.seconds_until_next_switch),
    }


def main():
    logging.basicConfig(
        level=Config.LOG_LEVEL,
        format=Config.LOG_FORMAT,
        datefmt=Config.LOG_DATE_FORMAT,
    )
    logger = logging.getLogger(__name__)

    Config.validate()

    manager = TraCIManager(Config)
    db_logger = DatabaseLogger(Config.DB_PATH)

    # Read-only dashboard server: daemon thread inside this process,
    # fed exclusively through LIVE_STATE.publish(). Set
    # Config.DASHBOARD_ENABLED = False to run without it.
    if Config.DASHBOARD_ENABLED:
        try:
            start_dashboard_server(
                LIVE_STATE, Config.DASHBOARD_HOST, Config.DASHBOARD_PORT
            )
        except Exception:
            logger.exception("Dashboard failed to start (simulation continues)")

    try:
        manager.start()
        adapter = TrafficAdapter(manager)
        twin = DigitalTwin()
        feature_engineer = FeatureEngineer(twin)

        # Training is a separate milestone, so no model may exist yet.
        # Checking here, once, at startup, means the rest of the
        # pipeline still runs normally and simply skips prediction,
        # rather than crashing the whole simulation over a missing file.
        predictor = None
        if os.path.isfile(Config.ML_MODEL_PATH):
            predictor = MLPredictor.from_path(Config.ML_MODEL_PATH)
        else:
            logger.warning(
                "No trained ML model found at %s, skipping prediction "
                "for now.",
                Config.ML_MODEL_PATH,
            )

        decision_engine = DecisionEngine(initial_phase="NS_straight_left")
        signal_controller = SignalController(tls_id=Config.TLS_ID)

        # Decision-tick throttling state. intersection.sumocfg's
        # step-length is 0.05s, so the per-step callback below fires 20x
        # per real second - decide()/apply_decision() must NOT run on
        # every call, only roughly once per Config.DECISION_INTERVAL_SECONDS
        # of real simulated time (see that constant's own comment for
        # why this interval specifically).
        last_decision_time = [None]

        # Rolling phase history for the dashboard timeline (~60 s at the
        # 1 Hz publish cadence) and pending predictions awaiting their
        # horizon so predicted-vs-actual can be evaluated later.
        phase_history = deque(maxlen=60)
        pending_predictions = {}  # target_time -> prediction payload

        def evaluate_matured_predictions(features):
            """
            Pair any prediction whose 15 s horizon has elapsed with the
            actual engineered values now observed, persist the pair to
            prediction_log, and expose it to the dashboard. Returns the
            most recently evaluated payload (or None).
            """
            latest_evaluated = None
            due_times = [
                t for t in pending_predictions if t <= features.simulation_time
            ]
            for target_time in sorted(due_times):
                pred_payload = pending_predictions.pop(target_time)
                rows = []
                confidences = []
                for lane_id, p in pred_payload["predictions"].items():
                    lane = features.lane_features.get(lane_id)
                    actual_veh = lane.vehicle_count if lane else 0
                    actual_wait = lane.average_waiting_time if lane else 0.0
                    rows.append({
                        "lane": lane_id,
                        "pred_veh": p["veh"],
                        "act_veh": actual_veh,
                        "pred_wait": p["wait"],
                        "act_wait": actual_wait,
                        "confidence": p["conf"],
                    })
                    confidences.append(p["conf"])
                    db_logger.log_prediction(
                        time=target_time,
                        predicted_values={
                            "vehicle_count": p["veh"],
                            "average_waiting_time": p["wait"],
                        },
                        actual_values={
                            "vehicle_count": actual_veh,
                            "average_waiting_time": actual_wait,
                        },
                        confidence=p["conf"],
                    )
                latest_evaluated = {
                    "target_time": target_time,
                    "rows": rows,
                    "avg_confidence": (
                        sum(confidences) / len(confidences)
                        if confidences else 0.0
                    ),
                }
            return latest_evaluated

        def update_twin():
            state = adapter.get_current_state()
            twin.update(state)
            features = feature_engineer.generate_features()

            is_first_tick = last_decision_time[0] is None
            elapsed_since_last_decision = (
                Config.DECISION_INTERVAL_SECONDS if is_first_tick
                else features.simulation_time - last_decision_time[0]
            )
            # A small epsilon tolerance, not a strict >=, deliberately:
            # repeated float addition of a 0.05s step-length can land a
            # hair below an exact 1.0s boundary (e.g. 2.05 - 1.05 works
            # out to 0.9999999999999998, not 1.0), which a strict
            # comparison would treat as "not yet due" and defer to the
            # next 0.05s step, overshooting by a full extra step every
            # time it happens. Same class of fix as
            # ml.training.config.TrainingConfig.HORIZON_TOLERANCE_SECONDS
            # elsewhere in this codebase, applied here because this
            # comparison has the identical floating-point risk.
            if not is_first_tick and elapsed_since_last_decision < Config.DECISION_INTERVAL_SECONDS - 1e-6:
                return

            # PERFORMANCE: status logging runs only on decision ticks
            # (1 Hz), never on every TraCI step - console I/O on Windows
            # was a measurable drag when done at 20 Hz.
            logger.info(
                "Time=%.2f | Vehicles=%d | AvgSpeed=%.2f | AvgWait=%.2f | Stopped=%d",
                features.simulation_time,
                features.total_vehicle_count,
                features.average_speed,
                features.average_waiting_time,
                features.stopped_vehicle_count,
            )

            prediction = predictor.predict(features) if predictor is not None else None

            # Park this prediction until its horizon elapses, then pair
            # it with reality (prediction_log + dashboard panel).
            latest_evaluated = evaluate_matured_predictions(features)
            if prediction is not None:
                pending_predictions[prediction.predicted_time] = {
                    "predictions": {
                        lane_id: {
                            "veh": lp.predicted_vehicle_count,
                            "wait": lp.predicted_average_waiting_time,
                            "conf": lp.confidence,
                        }
                        for lane_id, lp in prediction.lane_predictions.items()
                    }
                }

            # EMERGENCY DETECTION: raw fact from the adapter (which
            # vehicle classes are where); all prioritization logic stays
            # inside DecisionEngine, exactly as its docstring requires.
            emergency_lanes = adapter.get_emergency_vehicle_lanes()
            if emergency_lanes:
                logger.info("Emergency vehicles detected on: %s",
                            ", ".join(sorted(emergency_lanes)))

            decision = decision_engine.decide(
                features, prediction,
                dt_seconds=elapsed_since_last_decision,
                emergency_lanes=emergency_lanes,
            )
            signal_controller.apply_decision(decision, dt_seconds=elapsed_since_last_decision)
            logger.info(
                "Decision: phase=%s mode=%s switched=%s | %s",
                decision.active_phase, decision.decision_mode, decision.switched,
                decision.reason_text,
            )
            last_decision_time[0] = features.simulation_time

            # ---- Persistence (1 Hz, insert-only, failure-tolerant) ----
            db_logger.log_decision(
                time=features.simulation_time,
                phase=decision.active_phase,
                duration=decision.green_duration_seconds,
                mode=decision.decision_mode,
                reason=decision.reason_text,
            )
            db_logger.log_performance(
                time=features.simulation_time,
                avg_wait=features.average_waiting_time,
                avg_speed=features.average_speed,
                queue_length=features.stopped_vehicle_count,
                stopped=features.stopped_vehicle_count,
            )

            # ---- Dashboard snapshot (read-only consumer) ----
            sig_view = _signal_view(state)
            phase_history.append({
                "time": features.simulation_time,
                "phase": decision.active_phase,
                "is_yellow": sig_view["is_yellow"],
            })
            lane_states = dict(state.signal.lane_states)
            lanes_payload = [
                {
                    "lane_id": lane_id,
                    "vehicles": (
                        features.lane_features[lane_id].vehicle_count
                        if lane_id in features.lane_features else 0
                    ),
                    "avg_wait": (
                        features.lane_features[lane_id].average_waiting_time
                        if lane_id in features.lane_features else 0.0
                    ),
                    "signal": lane_states.get(lane_id, "r"),
                }
                for lane_id in ALL_APPROACH_LANES
            ]
            LIVE_STATE.publish({
                "sim_time": features.simulation_time,
                "signal": sig_view,
                "metrics": {
                    "vehicles": features.total_vehicle_count,
                    "avg_speed": features.average_speed,
                    "avg_wait": features.average_waiting_time,
                    "queue": features.stopped_vehicle_count,
                    "stopped": features.stopped_vehicle_count,
                },
                "lanes": lanes_payload,
                "decision": {
                    "active_phase": decision.active_phase,
                    "mode": decision.decision_mode,
                    "switched": decision.switched,
                    "reason": decision.reason_text,
                    "duration": decision.green_duration_seconds,
                    "phase_scores": dict(decision.phase_scores),
                },
                "emergency_lanes": sorted(emergency_lanes),
                "prediction": latest_evaluated,
                "comparison": None,  # populated by evaluator --dashboard runs
                "phase_history": list(phase_history),
            })

        manager.run(update_twin)
    except Exception:
        logger.exception("Simulation stopped due to an unexpected error.")
        raise
    finally:
        # Runs whether the simulation finished normally, was interrupted,
        # or raised an exception above, so the TraCI connection and the
        # underlying SUMO process are never left dangling.
        manager.close()
        db_logger.close()


if __name__ == "__main__":
    main()