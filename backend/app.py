"""
app.py
======
Entry point for the TraCI communication layer. Wires Config and
TraCIManager together and guarantees the TraCI connection is closed even
if the simulation raises partway through, via try/finally. This file
intentionally contains no simulation logic of its own, that all lives in
TraCIManager, app.py only orchestrates startup, run, and shutdown.
"""

import logging

from config import Config
from traffic.traci_manager import TraCIManager
from traffic_adapter.adapter import TrafficAdapter


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
        def print_state():
         state = adapter.get_current_state()

         logger.info(
            "Time=%.2f | Vehicles=%d",
            state.simulation_time,
            len(state.vehicles),
         )
        manager.run(print_state)
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