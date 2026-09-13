"""
evaluator.py
============
The Performance Evaluation engine: runs TWO PARALLEL, LOCKSTEP-
SYNCHRONIZED SUMO simulations of the SAME scenario (same network, same
route files, same seed - they are literally the same frozen sumocfg) and
compares how each one's signal control serves that identical demand:

  Simulation A ("ai")       Full project pipeline:
                            TrafficAdapter -> DigitalTwin ->
                            FeatureEngineer -> MLPredictor ->
                            DecisionEngine -> SignalController.
  Simulation B ("baseline") Selectable via --baseline (see
                            performance.baseline_controllers):
                              fixed_timer (default) - TrafficAdapter +
                                MetricsCollector ONLY. NO controller of
                                any kind - the frozen network's own
                                static tlLogic program runs untouched.
                                This is the "before" picture the guide's
                                Section 10.7.1 explicitly argues is too
                                weak a baseline on its own.
                              vac - TrafficAdapter + FeatureEngineer +
                                VehicleActuatedController + its OWN
                                SignalController (bound to the baseline
                                connection). A real demand-responsive
                                controller, not a strawman - beating it
                                is a materially stronger claim. Still
                                NEVER the ML DecisionEngine.

WHY TWO SEPARATE SUMO INSTANCES (a hard design rule): merging both into
one instance is impossible without breaking the comparison - one traffic
light cannot simultaneously run AI and default control, and shared
vehicle state would couple every metric. Two processes with two labeled
TraCI connections keep the worlds completely isolated; identical demand
is guaranteed by launching both from the same sumocfg (same routes,
same random seed), not by copying vehicles.

WHY LOCKSTEP: both simulations use the same step-length (0.05s from the
frozen config). The main loop advances both exactly once per iteration
and records metrics from each at the same simulated timestamp, so every
metric pair below compares like-for-like instants.

FAIRNESS GUARANTEES (each maps to a concrete mechanism):
    same network/routes/seed -> both managers launch the SAME sumocfg.
    same measurement path    -> both sides feed MetricsCollector the raw
                                SimulationState from their own adapter.
    same decision cadence    -> AI decisions throttle to 1 Hz with the
                                exact float-epsilon guard app.py uses.
    no cross-talk            -> adapters bind to their own manager's
                                connection; each SignalController is
                                bound to exactly one connection; the
                                baseline connection never receives an
                                AI-decided command, and (under
                                --baseline vac) the AI connection never
                                receives a VAC-decided one.

Usage (from backend/):
    python -m performance.evaluator --scenario heavy_seed1
    python -m performance.evaluator --scenario heavy_seed1 --baseline vac
    python -m performance.evaluator --scenario rush_hour_seed1 --gui

Outputs:
    stdout                           A side-by-side comparison panel with
                                     % improvement per metric.
    results/comparison_<scenario>.csv  Machine-readable full summary.
"""

import argparse
import csv
import logging
import os

import sumolib

from config import Config
from traffic.traci_manager import TraCIManager
from traffic_adapter.adapter import TrafficAdapter
from digital_twin import DigitalTwin
from feature_engineering import FeatureEngineer
from ml import MLPredictor
from decision_engine.decision_engine import DecisionEngine
from signal_controller.signal_controller import SignalController

from performance.baseline_controllers import VehicleActuatedController
from performance.metrics_collector import MetricsCollector
from services.live_state import DEFAULT_STORE as LIVE_STATE, RemoteLiveStatePublisher
from services.dashboard_server import start_dashboard_server

logger = logging.getLogger(__name__)

SCENARIO_DIR = os.path.join(Config.PROJECT_ROOT, "sumo", "config", "scenarios")
RESULTS_DIR = os.path.join(Config.PROJECT_ROOT, "results")

# Comparison rows: (summary key, human label, better-direction).
# "lower" means smaller is better (waiting, queues); "higher" means
# larger is better (speed, throughput). Improvement % is signed so the
# panel can show an honest regression as easily as a win.
COMPARISON_METRICS = (
    ("avg_waiting_time_seconds", "Avg Waiting Time (s)", "lower"),
    ("avg_travel_time_seconds", "Avg Travel Time (s)", "lower"),
    ("max_travel_time_seconds", "Worst Travel Time (s)", "lower"),
    ("avg_queue_length_vehicles", "Avg Queue Length (veh)", "lower"),
    ("max_queue_length_vehicles", "Max Queue Length (veh)", "lower"),
    ("avg_speed_mps", "Avg Speed (m/s)", "higher"),
    ("throughput_vehicles", "Throughput (veh completed)", "higher"),
)

CSV_FIELDS = (
    "metric", "ai", "baseline", "improvement_pct",
)

BASELINE_CONTROLLERS = ("fixed_timer", "vac")


class _SimConfig:
    """
    Duck-type of Config for TraCIManager: same SUMOCFG_PATH /
    get_sumo_binary() contract, bound to one binary name and one
    scenario sumocfg. Both simulations receive the SAME sumocfg path -
    that identity IS the fairness guarantee for network, routes, and
    seed.
    """

    def __init__(self, sumocfg_path: str, binary_name: str):
        self.SUMOCFG_PATH = sumocfg_path
        self._binary_name = binary_name

    def get_sumo_binary(self):
        return sumolib.checkBinary(self._binary_name)


class PerformanceEvaluator:
    """
    Runs one AI-vs-baseline comparison for one scenario.
    """

    def __init__(
        self, scenario_name: str, use_gui: bool = False, baseline: str = "fixed_timer",
        decision_config=None,
    ):
        # decision_config: optional DecisionConfig override for the AI side,
        # None (default) uses DecisionEngine's own normal defaults/calibration
        # loading unchanged. Exists for controlled tuning experiments (e.g.
        # "does disabling prediction influence change light-traffic results")
        # without needing a second copy of this whole run() method.
        self._decision_config = decision_config
        if baseline not in BASELINE_CONTROLLERS:
            raise ValueError(
                "baseline must be one of {}, got {!r}".format(BASELINE_CONTROLLERS, baseline)
            )
        self._scenario_name = scenario_name
        self._use_gui = use_gui
        self._baseline = baseline
        sumocfg_path = os.path.join(
            SCENARIO_DIR, "{}.sumocfg".format(scenario_name)
        )
        if not os.path.isfile(sumocfg_path):
            raise FileNotFoundError(
                "Scenario config not found: {}".format(sumocfg_path)
            )
        # One shared path object value used by BOTH sim configs.
        self._sumocfg_path = sumocfg_path

    def _load_predictor(self):
        if os.path.isfile(Config.ML_MODEL_PATH):
            return MLPredictor.from_path(Config.ML_MODEL_PATH)
        logger.warning(
            "No trained model at %s - AI simulation will decide on "
            "current state only.", Config.ML_MODEL_PATH,
        )
        return None

    @staticmethod
    def _comparison_rows(ai_summary: dict, base_summary: dict) -> list:
        """
        Build the metric-row list shared by the console panel and the
        dashboard's live AI-vs-baseline table.
        """
        rows = []
        for key, label, direction in COMPARISON_METRICS:
            base_value = base_summary[key]
            ai_value = ai_summary[key]
            if base_value == 0.0:
                improvement = 0.0
            elif direction == "lower":
                improvement = (base_value - ai_value) / base_value * 100.0
            else:
                improvement = (ai_value - base_value) / base_value * 100.0
            rows.append({
                "key": key, "label": label,
                "ai": ai_value, "baseline": base_value,
                "improvement": improvement,
            })
        return rows

    def run(self, live_store=None) -> dict:
        """
        Execute both simulations in lockstep and return:

            {
              "scenario": str,
              "ai": MetricsCollector.summary() dict,
              "baseline": MetricsCollector.summary() dict,
              "improvement_pct": {metric_key: signed float},
            }
        """
        predictor = self._load_predictor()
        binary_name = "sumo-gui" if self._use_gui else "sumo"

        manager_ai = TraCIManager(
            _SimConfig(self._sumocfg_path, binary_name), label="ai"
        )
        manager_base = TraCIManager(
            _SimConfig(self._sumocfg_path, binary_name), label="baseline"
        )

        try:
            manager_ai.start()
            manager_base.start()

            adapter_ai = TrafficAdapter(manager_ai)
            adapter_base = TrafficAdapter(manager_base)

            # ---- Simulation A: the full AI pipeline ----
            twin = DigitalTwin()
            feature_engineer = FeatureEngineer(twin)
            decision_engine = DecisionEngine(
                initial_phase="NS_straight_left", config=self._decision_config,
            )
            # Explicitly bound to the AI connection: with two parallel
            # instances the module-level default connection is ambiguous,
            # and a stray signal command landing on the baseline would
            # silently invalidate the whole comparison.
            signal_controller = SignalController(
                Config.TLS_ID, traci_connection=manager_ai.connection
            )
            collector_ai = MetricsCollector()

            # ---- Simulation B: fixed_timer (zero control, the frozen
            # network's own static tlLogic runs untouched) or vac (a
            # real demand-responsive controller - see module docstring
            # and performance.baseline_controllers.VehicleActuatedController).
            collector_base = MetricsCollector()
            twin_base = None
            feature_engineer_base = None
            baseline_controller = None
            signal_controller_base = None
            if self._baseline == "vac":
                twin_base = DigitalTwin()
                feature_engineer_base = FeatureEngineer(twin_base)
                baseline_controller = VehicleActuatedController(initial_phase="NS_straight_left")
                # Bound explicitly to the BASELINE connection - the same
                # cross-talk guard as the AI's own SignalController above,
                # just on the other side.
                signal_controller_base = SignalController(
                    Config.TLS_ID, traci_connection=manager_base.connection
                )

            conn_ai = manager_ai.connection
            conn_base = manager_base.connection

            last_decision_time = [None]
            last_decision_time_base = [None]
            # Total phase switches each side actually committed over the
            # whole run - concrete, measurable evidence for the
            # anti-flicker goal (see DecisionConfig.switch_confirmation_seconds
            # and DecisionEngine's gap-out logic), not just an assumption
            # that fewer switches happened.
            switch_counts = {"ai": 0, "baseline": 0}

            def record(collector, adapter):
                state = adapter.get_current_state()
                collector.record(
                    state,
                    departed_vehicle_ids=adapter.get_departed_vehicle_ids(),
                    arrived_vehicle_ids=adapter.get_arrived_vehicle_ids(),
                    stop_starting_vehicle_ids=adapter.get_stop_starting_vehicle_ids(),
                    stop_ending_vehicle_ids=adapter.get_stop_ending_vehicle_ids(),
                )
                return state

            last_live_publish = [None]

            while True:
                ai_pending = conn_ai.simulation.getMinExpectedNumber() > 0
                base_pending = conn_base.simulation.getMinExpectedNumber() > 0
                if not ai_pending and not base_pending:
                    break

                if ai_pending:
                    conn_ai.simulationStep()
                    state_ai = record(collector_ai, adapter_ai)
                    twin.update(state_ai)
                    features = feature_engineer.generate_features()

                    # Identical 1 Hz throttling + float-epsilon guard to
                    # app.py - the AI must experience the same temporal
                    # sampling here that it was trained and deployed on.
                    is_first_tick = last_decision_time[0] is None
                    elapsed = (
                        Config.DECISION_INTERVAL_SECONDS if is_first_tick
                        else features.simulation_time - last_decision_time[0]
                    )
                    if is_first_tick or elapsed >= Config.DECISION_INTERVAL_SECONDS - 1e-6:
                        prediction = (
                            predictor.predict(features)
                            if predictor is not None else None
                        )
                        decision = decision_engine.decide(
                            features, prediction,
                            dt_seconds=elapsed,
                            emergency_lanes=frozenset(),
                        )
                        signal_controller.apply_decision(
                            decision, dt_seconds=elapsed
                        )
                        if decision.switched:
                            switch_counts["ai"] += 1
                        last_decision_time[0] = features.simulation_time

                if base_pending:
                    conn_base.simulationStep()
                    state_base = record(collector_base, adapter_base)

                    if baseline_controller is not None:
                        twin_base.update(state_base)
                        features_base = feature_engineer_base.generate_features()

                        # Identical 1 Hz throttling to the AI side, own
                        # independent clock - the two controllers must
                        # not share decision timing state.
                        is_first_tick_base = last_decision_time_base[0] is None
                        elapsed_base = (
                            Config.DECISION_INTERVAL_SECONDS if is_first_tick_base
                            else features_base.simulation_time - last_decision_time_base[0]
                        )
                        if is_first_tick_base or elapsed_base >= Config.DECISION_INTERVAL_SECONDS - 1e-6:
                            # VAC never uses a prediction - its decide()
                            # accepts the parameter only to match the
                            # same interface DecisionEngine uses.
                            decision_base = baseline_controller.decide(
                                features_base, None, dt_seconds=elapsed_base,
                                emergency_lanes=frozenset(),
                            )
                            signal_controller_base.apply_decision(
                                decision_base, dt_seconds=elapsed_base
                            )
                            if decision_base.switched:
                                switch_counts["baseline"] += 1
                            last_decision_time_base[0] = features_base.simulation_time
                    # else (fixed_timer): measurement only. No twin, no
                    # features, no decisions, no signal commands ever
                    # touch this connection - SUMO's own static tlLogic
                    # controls it untouched.

                # Live AI-vs-baseline feed for the dashboard (~1 Hz).
                # summary() is a pure function over accumulated
                # integrals, so calling it mid-run is safe; the numbers
                # simply converge as the run progresses.
                if live_store is not None:
                    now = collector_ai.summary()["simulation_duration_seconds"]
                    if last_live_publish[0] is None or now - last_live_publish[0] >= 1.0:
                        ai_mid = collector_ai.summary()
                        base_mid = collector_base.summary()
                        live_store.publish({
                            "sim_time": max(
                                ai_mid["simulation_duration_seconds"],
                                base_mid["simulation_duration_seconds"],
                            ),
                            "signal": None,
                            "metrics": {
                                "vehicles": 0, "avg_speed": ai_mid["avg_speed_mps"],
                                "avg_wait": ai_mid["avg_waiting_time_seconds"],
                                "queue": ai_mid["avg_queue_length_vehicles"],
                                "stopped": ai_mid["max_stopped_vehicles"],
                            },
                            "lanes": [], "decision": {}, "emergency_lanes": [],
                            "prediction": None, "phase_history": [],
                            "comparison": {
                                "rows": self._comparison_rows(ai_mid, base_mid),
                                "baseline_controller": self._baseline,
                            },
                        })
                        last_live_publish[0] = now

        except KeyboardInterrupt:
            logger.info("Evaluation interrupted by user.")
        finally:
            manager_ai.close()
            manager_base.close()

        ai_summary = collector_ai.summary()
        base_summary = collector_base.summary()

        improvement = {
            row["key"]: row["improvement"]
            for row in self._comparison_rows(ai_summary, base_summary)
        }

        return {
            "scenario": self._scenario_name,
            "baseline_controller": self._baseline,
            "ai": ai_summary,
            "baseline": base_summary,
            "improvement_pct": improvement,
            "switch_counts": switch_counts,
        }

    @staticmethod
    def print_panel(result: dict) -> None:
        """
        Render the demo-ready comparison panel:

            Metric                     AI      Baseline   Change
            Avg Waiting Time (s)     12.40      18.70     v 33.7% IMPROVED
        """
        ai = result["ai"]
        base = result["baseline"]
        imp = result["improvement_pct"]

        baseline_label = (
            "Vehicle Actuated Control (VAC)"
            if result.get("baseline_controller") == "vac" else "Fixed-Timer"
        )
        print()
        print("=== AI vs {} - {} ===".format(baseline_label, result["scenario"]))
        header = "{:<28} {:>12} {:>12} {:>16}".format(
            "Metric", "AI", "Baseline", "Change"
        )
        print(header)
        print("-" * len(header))
        for key, label, _direction in COMPARISON_METRICS:
            arrow = "v" if imp[key] >= 0 else "x"
            verdict = "IMPROVED" if imp[key] >= 0 else "REGRESSED"
            print("{:<28} {:>12.2f} {:>12.2f} {:>7} {:>6.1f}% {}".format(
                label, ai[key], base[key], arrow, abs(imp[key]), verdict,
            ))
        switches = result.get("switch_counts")
        if switches is not None:
            print("-" * len(header))
            print("{:<28} {:>12} {:>12}".format(
                "Phase switches (informational)", switches["ai"], switches["baseline"],
            ))
        print()

    @staticmethod
    def save_csv(result: dict) -> str:
        """
        Write the machine-readable comparison CSV; returns its path.
        """
        os.makedirs(RESULTS_DIR, exist_ok=True)
        csv_path = os.path.join(
            RESULTS_DIR, "comparison_{}.csv".format(result["scenario"])
        )
        ai = result["ai"]
        base = result["baseline"]
        imp = result["improvement_pct"]
        with open(csv_path, "w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
            writer.writeheader()
            for key, label, _direction in COMPARISON_METRICS:
                writer.writerow({
                    "metric": label,
                    "ai": "{:.4f}".format(ai[key]),
                    "baseline": "{:.4f}".format(base[key]),
                    "improvement_pct": "{:.2f}".format(imp[key]),
                })
        return csv_path


def main():
    parser = argparse.ArgumentParser(
        description="Run ONE AI-vs-baseline parallel evaluation "
                    "(two synchronized SUMO instances)."
    )
    parser.add_argument(
        "--scenario", default="heavy_seed1",
        help="Scenario name (sumocfg in sumo/config/scenarios).",
    )
    parser.add_argument(
        "--gui", action="store_true",
        help="Run both simulations in sumo-gui windows (demo mode).",
    )
    parser.add_argument(
        "--baseline", choices=BASELINE_CONTROLLERS, default="fixed_timer",
        help="Baseline controller for simulation B: 'fixed_timer' (the "
             "frozen network's own static program, untouched - the "
             "default) or 'vac' (Vehicle Actuated Control, a real "
             "demand-responsive baseline - see performance."
             "baseline_controllers.VehicleActuatedController).",
    )
    parser.add_argument(
        "--dashboard", action="store_true",
        help="Serve the live dashboard (http://127.0.0.1:8000) with a "
             "real-time AI-vs-baseline comparison panel.",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.WARNING)

    # PUSH_TO_CONTROL_URL means a control layer (app.py's dashboard, via
    # services/control_routes.py) launched this process and already owns
    # the dashboard port - publish to it over HTTP instead of trying to
    # self-host a second server on the same port. Unset (the normal
    # direct-terminal case): --dashboard behaves exactly as it always
    # has, self-hosting its own dashboard.
    control_url = os.environ.get("PUSH_TO_CONTROL_URL")
    live_store = None
    if control_url:
        live_store = RemoteLiveStatePublisher(control_url)
    elif args.dashboard:
        live_store = LIVE_STATE
        start_dashboard_server(LIVE_STATE)

    evaluator = PerformanceEvaluator(args.scenario, use_gui=args.gui, baseline=args.baseline)
    result = evaluator.run(live_store=live_store)
    PerformanceEvaluator.print_panel(result)
    csv_path = PerformanceEvaluator.save_csv(result)
    print("Saved: {}".format(csv_path))


if __name__ == "__main__":
    main()