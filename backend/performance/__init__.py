"""
performance
===========
Performance Evaluation module (Section 10.7 of the architecture):
measures how well each signal control strategy serves the same traffic
demand, and produces the comparison evidence for the project report.

Contents
--------
metrics_collector       MetricsCollector: time-weighted aggregation of
                        all six core metric families (waiting time,
                        queue length, throughput, speed, stopped
                        vehicles, travel time) from raw SimulationState
                        snapshots. One instance per simulation.
evaluator               PerformanceEvaluator: runs TWO PARALLEL,
                        LOCKSTEP-SYNCHRONIZED SUMO instances of the same
                        scenario - Simulation A under the full AI
                        pipeline, Simulation B under SUMO's own default
                        static program with measurement only - and
                        produces the side-by-side comparison panel and
                        CSV with % improvement per metric.
baseline_controllers    FixedTimerController and VehicleActuatedController,
                        alternative Python-side baselines that emit the
                        same Decision objects as the ML DecisionEngine
                        so SignalController executes them unchanged.
                        Used by evaluate.py's controller-matrix runner.
evaluate                Batch runner comparing fixed_timer / vac / ai
                        across many scenarios sequentially (one SUMO
                        instance at a time).

Design rules respected:
  - This package never imports traci. All raw facts arrive via
    TrafficAdapter (SimulationState / departed / arrived IDs).
  - The two parallel simulations are SEPARATE SUMO processes on
    separate labeled TraCI connections - never one shared instance.
  - The baseline simulation receives ZERO control commands; its frozen
    tlLogic program runs exactly as designed.
"""

from performance.metrics_collector import MetricsCollector
from performance.evaluator import PerformanceEvaluator
from performance.baseline_controllers import (
    FixedTimerController,
    VehicleActuatedController,
)

__all__ = [
    "MetricsCollector",
    "PerformanceEvaluator",
    "FixedTimerController",
    "VehicleActuatedController",
]