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

from config import Config
from traffic.traci_manager import TraCIManager
from traffic_adapter.adapter import TrafficAdapter
from digital_twin import DigitalTwin


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

        def update_twin():
            state = adapter.get_current_state()
            twin.update(state)

            # Temporary logging only, this will be replaced once a real
            # consumer (Feature Engineering) reads from the Digital Twin.
            logger.info(
                "Time=%.2f | Vehicles=%d",
                twin.current_state.simulation_time,
                len(twin.current_state.vehicles),
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