"""
simulation_runner.py
====================
One live AI-controlled simulation, start to finish, as a callable.

This is the orchestration that used to live inside app.py's main(),
extracted verbatim on 2026-09-12 for one reason: the console (see
server.py) can now start a run from a button in the browser, and both
entry points must run EXACTLY the same simulation rather than two
lookalike copies that drift apart. app.py is now a thin CLI wrapper
around run_simulation(); server.py hands it to SimulationSupervisor to
run on a worker thread.

It wires Config, TraCIManager, TrafficAdapter, DigitalTwin,
FeatureEngineer, MLPredictor, DecisionEngine and SignalController
together and guarantees the TraCI connection is closed even if the
simulation raises partway through, via try/finally. There is no
simulation logic of its own here - that all lives in the modules above;
this file only orchestrates startup, run, shutdown, and the three
read-only side-channels:

  1. SQLite persistence   (database.DatabaseLogger, 1 Hz inserts)
  2. Dashboard snapshots  (services.LiveStateStore -> FastAPI WS thread)
  3. Emergency detection  (adapter raw fact -> DecisionEngine input)

None of these can influence control: the database is a sink, the
dashboard server never receives commands, and emergency handling logic
lives entirely inside DecisionEngine. The one thing that CAN influence
the run is the optional RunControl (pause/resume/stop/speed), which is
deliberately a separate, single-purpose object - see
services/run_control.py.
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
from decision_engine.decision_engine import DecisionEngine, ALL_APPROACH_LANES
from signal_controller.signal_controller import SignalController, PHASE_TO_INDEX
from database import DatabaseLogger

logger = logging.getLogger(__name__)

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


def resolve_config(gui=None, base=Config, load_state=None, sumocfg=None):
    """
    Return the Config to run with.

    `gui=None` means "whatever Config already says" - the behaviour every
    terminal run has always had. True/False force sumo-gui/sumo for this
    run only, via a throwaway SUBCLASS rather than by assigning to
    Config.SUMO_BINARY_NAME: Config is a process-wide singleton, and a
    console that can start several runs in a row must not leave one run's
    choice behind for the next. get_sumo_binary() is a classmethod, so it
    resolves cls.SUMO_BINARY_NAME from the subclass exactly as intended.
    """
    if gui is None and load_state is None and sumocfg is None:
        return base
    extra = list(getattr(base, "SUMO_EXTRA_ARGS", None) or [])
    overrides = {}
    if sumocfg:
        # Which scenario to run - chosen per run from the browser (see
        # performance.scenarios), never assigned into the shared Config.
        overrides["SUMOCFG_PATH"] = sumocfg
    if gui is not None:
        overrides["SUMO_BINARY_NAME"] = "sumo-gui" if gui else "sumo"
        if gui:
            # A GUI run launched from the browser:
            #   --delay 0     the pace is set here (see RunControl.pace),
            #                 so sumo-gui must not throttle on top of it;
            #                 two throttles in series just multiply
            #   --start       no click needed on the GUI play button
            #   --quit-on-end sumo-gui KEEPS ITS WINDOW OPEN after the
            #                 simulation ends by default, which leaves
            #                 traci.close() blocking on a process that is
            #                 never going to exit - the run thread then
            #                 never finishes and the console reports it as
            #                 still running forever. Measured, not guessed.
            extra += ["--start", "--delay", "0", "--quit-on-end", "true"]
    if load_state:
        # Resume a simulation saved mid-run, which is how "open the SUMO
        # window" continues the SAME run instead of starting a new one.
        # SUMO cannot attach a GUI to a process already running, so
        # save-and-reload is the only route there is.
        extra += ["--load-state", load_state]
    overrides["SUMO_EXTRA_ARGS"] = extra
    return type("RunConfig", (base,), overrides)


def run_simulation(store, control=None, *, gui=None, base_config=Config,
                   load_state=None, sumocfg=None):
    """
    Run one live simulation to completion.

    Parameters
    ----------
    store : services.live_state.LiveStateStore
        Where the 1 Hz dashboard snapshot is published. Required, and
        deliberately passed in rather than imported, so a caller can hand
        over a different store (or a remote publisher) without this
        module knowing which process it is in.
    control : services.run_control.RunControl | None
        Pause/resume/stop/speed for this run. None runs unconditionally
        to completion, exactly as before this existed.
    gui : bool | None
        Force sumo-gui (True) or headless sumo (False) for this run only.
        None leaves Config.SUMO_BINARY_NAME alone.
    load_state : str | None
        A state file written by a previous handover. The simulation
        resumes from exactly there - same vehicles, same signal state,
        same simulated time - instead of starting at t=0.
    sumocfg : str | None
        The scenario's .sumocfg to run (see performance.scenarios). None
        runs whatever base_config says - the frozen production route.
    base_config : type
        The Config to start from. Only overridden in tests.

    Raises whatever the simulation raised, after closing TraCI and the
    database - the caller decides whether that is fatal.
    """
    config = resolve_config(gui, base_config, load_state, sumocfg)
    config.validate()

    manager = TraCIManager(config)
    db_logger = DatabaseLogger(config.DB_PATH)

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
        if os.path.isfile(config.ML_MODEL_PATH):
            predictor = MLPredictor.from_path(config.ML_MODEL_PATH)
        else:
            logger.warning(
                "No trained ML model found at %s, skipping prediction "
                "for now.",
                config.ML_MODEL_PATH,
            )

        # Start the engine on whatever phase the signal is ACTUALLY
        # showing rather than assuming phase 0. For a fresh run that is
        # NS_straight_left exactly as before; for a run resumed from a
        # saved state it is whatever was running when the state was
        # written, so the lights do not jump across a GUI handover.
        initial_phase = "NS_straight_left"
        try:
            index = manager.connection.trafficlight.getPhase(config.TLS_ID)
            # Odd indices are the yellow clearance out of the green below.
            initial_phase = _INDEX_TO_PHASE.get(
                index, _INDEX_TO_PHASE.get(index - 1, "NS_straight_left"))
        except Exception:
            logger.debug("Could not read the live signal phase; starting on %s.",
                         initial_phase, exc_info=True)
        decision_engine = DecisionEngine(initial_phase=initial_phase)
        signal_controller = SignalController(tls_id=config.TLS_ID)

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
                config.DECISION_INTERVAL_SECONDS if is_first_tick
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
            if not is_first_tick and elapsed_since_last_decision < config.DECISION_INTERVAL_SECONDS - 1e-6:
                return

            # Routine per-tick telemetry: DEBUG only. The dashboard (and
            # decision_log/performance_log in SQLite) already show this
            # live at the same 1 Hz cadence, so mirroring it to the
            # console on every tick was pure noise once the dashboard
            # existed - it was only ever useful before that.
            logger.debug(
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
            # A phase switch is a meaningful, infrequent event worth an
            # INFO line; the same decision holding its current phase
            # tick after tick is not - that case logs at DEBUG only.
            (logger.info if decision.switched else logger.debug)(
                "Decision: phase=%s mode=%s switched=%s | %s",
                decision.active_phase, decision.decision_mode, decision.switched,
                decision.reason_text,
            )
            last_decision_time[0] = features.simulation_time

            # Computed once, shared by persistence below and the
            # dashboard snapshot further down: sig_view is the ACTUAL
            # TraCI-confirmed signal state, distinct from `decision`
            # (the DESIRED state DecisionEngine just produced).
            sig_view = _signal_view(state)
            lane_states = dict(state.signal.lane_states)

            # ---- Persistence (1 Hz, insert-only, failure-tolerant) ----
            db_logger.log_decision(
                time=features.simulation_time,
                phase=decision.active_phase,
                duration=decision.green_duration_seconds,
                mode=decision.decision_mode,
                reason=decision.reason_text,
                actual_phase=sig_view["phase"],
                actual_is_yellow=sig_view["is_yellow"],
            )
            db_logger.log_performance(
                time=features.simulation_time,
                avg_wait=features.average_waiting_time,
                avg_speed=features.average_speed,
                queue_length=features.stopped_vehicle_count,
                stopped=features.stopped_vehicle_count,
            )
            db_logger.log_lane_states(
                time=features.simulation_time,
                rows=[
                    {
                        "lane_id": lane_id,
                        "vehicle_count": (
                            features.lane_features[lane_id].vehicle_count
                            if lane_id in features.lane_features else 0
                        ),
                        "avg_speed": (
                            features.lane_features[lane_id].average_speed
                            if lane_id in features.lane_features else 0.0
                        ),
                        "avg_waiting_time": (
                            features.lane_features[lane_id].average_waiting_time
                            if lane_id in features.lane_features else 0.0
                        ),
                        "stopped_count": (
                            features.lane_features[lane_id].stopped_vehicle_count
                            if lane_id in features.lane_features else 0
                        ),
                        # Reuses the exact per-lane urgency score
                        # DecisionEngine already computed this tick -
                        # never recomputed here, single source of truth.
                        "congestion_score": decision.lane_scores.get(lane_id, 0.0),
                        "signal_state": lane_states.get(lane_id, "r"),
                    }
                    for lane_id in ALL_APPROACH_LANES
                ],
            )

            # ---- Dashboard snapshot (read-only consumer) ----
            phase_history.append({
                "time": features.simulation_time,
                "phase": decision.active_phase,
                "is_yellow": sig_view["is_yellow"],
            })
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
                    # The same per-lane urgency score persisted above, so
                    # the dashboard can plot lane pressure live instead of
                    # reading it back out of SQLite afterwards. Rounded:
                    # it is a 0-1 score drawn as a shade, and four decimal
                    # places is already more than any pixel can show.
                    "score": round(decision.lane_scores.get(lane_id, 0.0), 4),
                    "signal": lane_states.get(lane_id, "r"),
                }
                for lane_id in ALL_APPROACH_LANES
            ]
            store.publish({
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
                # Per-vehicle positions, so the dashboard can draw the
                # actual traffic on its plan view instead of inferring it
                # from per-lane counts. These come straight from
                # TrafficAdapter's existing VehicleState.position (a real
                # traci.vehicle.getPosition() reading in SUMO network
                # metres) - no new TraCI call, and still strictly
                # read-only: nothing here can influence control.
                #
                # Cost: this payload is published once per decision tick
                # (~1s, not per 0.05s step - see the early return above),
                # so a busy junction adds roughly 2-3 KB/s. Coordinates
                # are rounded to centimetres because sub-centimetre
                # precision is invisible on screen and just costs bytes.
                "vehicles": [
                    {
                        "id": v.id,
                        "lane": v.lane_id,
                        "x": round(v.position[0], 2),
                        "y": round(v.position[1], 2),
                        "speed": round(v.speed, 2),
                        # SUMO's own type id, so the dashboard can draw a
                        # bus as a bus. The dimensions that go with each
                        # type live in vehicle_types.add.xml, which is
                        # frozen, so the frontend holds that table rather
                        # than this paying for two more TraCI reads per
                        # vehicle per tick to send static numbers.
                        "type": v.type_id,
                    }
                    for v in state.vehicles
                ],
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

        manager.run(update_twin, control=control)
    finally:
        # Runs whether the simulation finished normally, was interrupted,
        # or raised an exception above, so the TraCI connection and the
        # underlying SUMO process are never left dangling.
        manager.close()
        db_logger.close()
