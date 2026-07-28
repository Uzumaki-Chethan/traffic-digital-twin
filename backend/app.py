"""
app.py
======
Entry point for the TraCI communication layer. Wires Config, TraCIManager,
TrafficAdapter, and DigitalTwin together and guarantees the TraCI
connection is closed even if the simulation raises partway through, via
try/finally. This file intentionally contains no simulation logic of its
own, that all lives in TraCIManager, TrafficAdapter, and DigitalTwin,
app.py only orchestrates startup, run, and shutdown.
"""

import logging
import os

from config import Config
from traffic.traci_manager import TraCIManager
from traffic_adapter.adapter import TrafficAdapter
from digital_twin import DigitalTwin
from feature_engineering import FeatureEngineer
from ml import MLPredictor


def main():
    logging.basicConfig(
        level=Config.LOG_LEVEL,
        format=Config.LOG_FORMAT,
        datefmt=Config.LOG_DATE_FORMAT,
    )
    logger = logging.getLogger(__name__)

    Config.validate()

    manager = TraCIManager(Config)
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

        def update_twin():
            state = adapter.get_current_state()
            twin.update(state)
            features = feature_engineer.generate_features()

            # Temporary logging only, this will be replaced once a real
            # consumer (the Decision Engine) reads from TrafficPrediction
            # instead.
            logger.info(
                "Time=%.2f | Vehicles=%d | AvgSpeed=%.2f | AvgWait=%.2f | Stopped=%d",
                features.simulation_time,
                features.total_vehicle_count,
                features.average_speed,
                features.average_waiting_time,
                features.stopped_vehicle_count,
            )

            if predictor is not None:
                prediction = predictor.predict(features)
                for lane_id, lane_prediction in prediction.lane_predictions.items():
                    logger.info(
                        "  Predicted[%s] t=%.2f | vehicles=%.2f | wait=%.2f | confidence=%.1f%%",
                        lane_id,
                        prediction.predicted_time,
                        lane_prediction.predicted_vehicle_count,
                        lane_prediction.predicted_average_waiting_time,
                        lane_prediction.confidence,
                    )

        manager.run(update_twin)
    except Exception:
        logger.exception("Simulation stopped due to an unexpected error.")
        raise
    finally:
        # Runs whether the simulation finished normally, was interrupted,
        # or raised an exception above, so the TraCI connection and the
        # underlying SUMO process are never left dangling.
        manager.close()


if __name__ == "__main__":
    main()