"""
evaluate.py
===========
Runnable Performance Evaluation runner: executes the SAME simulation
loop as app.py (adapter -> twin -> features -> 1 Hz decision ->
SignalController) once per (scenario, controller) pair, headless, and
aggregates each run into the comparison table for the report.

Controllers compared:
    fixed_timer   Blind cyclic program (the "before" picture).
    vac           Vehicle-actuated gap-out/max-out control.
    ai            The project's ML DecisionEngine + MLPredictor.

Usage (from backend/):
    python -m performance.evaluate                       # full matrix
    python -m performance.evaluate --controllers ai      # one controller
    python -m performance.evaluate --scenarios light_seed1 heavy_seed1

Outputs:
    results/performance_summary.csv  One row per (scenario, controller).
    stdout                           A formatted comparison table.

Design notes:
    - Headless by design ("sumo", not "sumo-gui"): evaluation runs are
      batch jobs; a GUI would only add rendering cost and wall time.
    - Logging is forced to WARNING here regardless of Config.LOG_LEVEL:
      per-second INFO lines across dozens of runs are pure overhead when
      nobody is watching.
    - The decision-throttling logic (1 Hz ticks, float-epsilon guard) is
      deliberately identical to app.py's so every controller experiences
      the same temporal sampling the ML model was trained on.
"""

import argparse
import csv
import logging
import os
import sys

import sumolib

from config import Config
from traffic.traci_manager import TraCIManager
from traffic_adapter.adapter import TrafficAdapter
from digital_twin import DigitalTwin
from feature_engineering import FeatureEngineer
from ml import MLPredictor
from decision_engine.decision_engine import DecisionEngine
from signal_controller.signal_controller import SignalController

from performance.metrics_collector import MetricsCollector
from performance.baseline_controllers import (
    FixedTimerController,
    VehicleActuatedController,
)

logger = logging.getLogger(__name__)

SCENARIO_DIR = os.path.join(Config.PROJECT_ROOT, "sumo", "config", "scenarios")
RESULTS_DIR = os.path.join(Config.PROJECT_ROOT, "results")

# Representative demand spread: quiet -> normal -> directional -> peak ->
# oversaturated. Each maps to an existing frozen scenario sumocfg.
DEFAULT_SCENARIOS = (
    "light_seed1",
    "normal_traffic_seed1",
    "balanced_seed1",
    "heavy_seed1",
    "rush_hour_seed1",
    "extreme_seed1",
)

CONTROLLERS = ("fixed_timer", "vac", "ai")

SUMMARY_FIELDS = (
    "scenario", "controller",
    "avg_waiting_time_seconds",
    "avg_queue_length_vehicles",
    "max_queue_length_vehicles",
    "max_avg_waiting_time_seconds",
    "throughput_vehicles",
    "throughput_veh_per_hour",
    "simulation_duration_seconds",
    "sample_count",
)


class _HeadlessConfig:
    """
    Minimal duck-type of Config for TraCIManager: same SUMOCFG_PATH /
    get_sumo_binary() contract, but always resolves the headless binary
    and points at a caller-supplied scenario sumocfg. TraCIManager never
    imports this module, it only calls those two members, so no changes
    to the communication layer were needed to support batch evaluation.
    """

    def __init__(self, sumocfg_path: str):
        self.SUMOCFG_PATH = sumocfg_path

    @staticmethod
    def get_sumo_binary():
        return sumolib.checkBinary("sumo")


def _make_controller(name: str):
    if name == "fixed_timer":
        return FixedTimerController()
    if name == "vac":
        return VehicleActuatedController()
    if name == "ai":
        return DecisionEngine(initial_phase="NS_straight_left")
    raise ValueError(
        "Unknown controller {!r}; expected one of {}".format(name, CONTROLLERS)
    )


def run_single(scenario_name: str, controller_name: str, predictor) -> dict:
    """
    Run one headless simulation of one scenario under one controller and
    return its metrics summary dict (plus scenario/controller labels).
    """
    sumocfg_path = os.path.join(SCENARIO_DIR, "{}.sumocfg".format(scenario_name))
    if not os.path.isfile(sumocfg_path):
        raise FileNotFoundError(
            "Scenario config not found: {}".format(sumocfg_path)
        )

    manager = TraCIManager(_HeadlessConfig(sumocfg_path))
    try:
        manager.start()
        adapter = TrafficAdapter(manager)
        twin = DigitalTwin()
        feature_engineer = FeatureEngineer(twin)
        controller = _make_controller(controller_name)
        signal_controller = SignalController(tls_id=Config.TLS_ID)
        metrics = MetricsCollector()

        last_decision_time = [None]

        def update_twin():
            state = adapter.get_current_state()
            twin.update(state)
            features = feature_engineer.generate_features()

            # Raw facts come through the adapter, keeping this module
            # traci-free per the architecture boundary rule. Metrics are
            # recorded from the raw SimulationState (not TrafficFeatures)
            # so both evaluation paths measure identically.
            metrics.record(
                state,
                departed_vehicle_ids=adapter.get_departed_vehicle_ids(),
                arrived_vehicle_ids=adapter.get_arrived_vehicle_ids(),
            )

            is_first_tick = last_decision_time[0] is None
            elapsed = (
                Config.DECISION_INTERVAL_SECONDS if is_first_tick
                else features.simulation_time - last_decision_time[0]
            )
            if not is_first_tick and elapsed < Config.DECISION_INTERVAL_SECONDS - 1e-6:
                return

            prediction = None
            if controller_name == "ai" and predictor is not None:
                prediction = predictor.predict(features)

            decision = controller.decide(
                features, prediction,
                dt_seconds=elapsed,
                emergency_lanes=frozenset(),
            )
            signal_controller.apply_decision(decision, dt_seconds=elapsed)
            last_decision_time[0] = features.simulation_time

        manager.run(update_twin)
    finally:
        manager.close()

    summary = metrics.summary()
    summary["scenario"] = scenario_name
    summary["controller"] = controller_name
    logger.info(
        "%s / %s done: avg_wait=%.2fs avg_queue=%.2f throughput=%d veh (%.0f veh/h)",
        scenario_name, controller_name,
        summary["avg_waiting_time_seconds"],
        summary["avg_queue_length_vehicles"],
        int(summary["throughput_vehicles"]),
        summary["throughput_veh_per_hour"],
    )
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Run the performance evaluation matrix "
                    "(scenarios x controllers), headless."
    )
    parser.add_argument(
        "--scenarios", nargs="+", default=list(DEFAULT_SCENARIOS),
        help="Scenario names (sumocfg files in sumo/config/scenarios).",
    )
    parser.add_argument(
        "--controllers", nargs="+", default=list(CONTROLLERS),
        help="Subset of: {}".format(", ".join(CONTROLLERS)),
    )
    args = parser.parse_args()

    for name in args.controllers:
        if name not in CONTROLLERS:
            parser.error("unknown controller {!r}".format(name))

    logging.basicConfig(level=logging.WARNING)

    # Load the trained model once, up front. If it is missing, AI runs
    # degrade to current-state-only decisions rather than crashing the
    # whole matrix - same graceful policy as app.py.
    predictor = None
    if os.path.isfile(Config.ML_MODEL_PATH):
        from ml import MLPredictor as _P  # already imported above; kept local for clarity
        predictor = _P.from_path(Config.ML_MODEL_PATH)
    else:
        logger.warning(
            "No trained model at %s - 'ai' runs will use current-state "
            "decisions only.", Config.ML_MODEL_PATH,
        )

    rows = []
    total = len(args.scenarios) * len(args.controllers)
    done = 0
    for scenario in args.scenarios:
        for controller in args.controllers:
            done += 1
            print("[{}/{}] {} x {} ...".format(done, total, scenario, controller))
            rows.append(run_single(scenario, controller, predictor))

    os.makedirs(RESULTS_DIR, exist_ok=True)
    csv_path = os.path.join(RESULTS_DIR, "performance_summary.csv")
    with open(csv_path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=SUMMARY_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print()
    print("=== Performance Evaluation Summary ===")
    header = "{:<22} {:<12} {:>10} {:>10} {:>12} {:>12}".format(
        "Scenario", "Controller", "AvgWait", "AvgQueue", "MaxQueue", "Veh/hour",
    )
    print(header)
    print("-" * len(header))
    for row in rows:
        print("{:<22} {:<12} {:>10.2f} {:>10.2f} {:>12.0f} {:>12.0f}".format(
            row["scenario"], row["controller"],
            row["avg_waiting_time_seconds"],
            row["avg_queue_length_vehicles"],
            row["max_queue_length_vehicles"],
            row["throughput_veh_per_hour"],
        ))
    print("Saved: {}".format(csv_path))


if __name__ == "__main__":
    main()