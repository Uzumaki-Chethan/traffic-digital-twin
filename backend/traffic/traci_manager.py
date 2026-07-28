"""
traci_manager.py
=================
Owns the full TraCI connection lifecycle: starting SUMO, stepping the
simulation, and closing the connection safely. Deliberately does nothing
else, no density calculation, no signal logic, no AI. Its only job is to
prove that Python and SUMO can communicate reliably, one step at a time,
and hand back control cleanly when the simulation ends.
"""

import logging

import traci
from traci.exceptions import FatalTraCIError

logger = logging.getLogger(__name__)


class TraCIManager:
    """
    Manages a single TraCI connection to a single SUMO instance.

    Connection state lives on the instance (self._connected), not as a
    module level flag, so nothing outside this class can read or mutate
    it directly, and multiple TraCIManager instances (useful later for
    testing) never interfere with one another.
    """

    def __init__(self, config):
        """
        config: the Config class (or an instance of it) providing
        SUMOCFG_PATH and get_sumo_binary(). Passed in explicitly rather
        than imported directly, so this class has no hidden dependency
        on a specific config module and can be tested with a fake config.
        """
        self._config = config
        self._connected = False

    @property
    def is_connected(self):
        """
        Read-only property indicating whether a TraCI connection is
        currently active.

        Returns
        -------
        bool
            True if start() has successfully established a connection
            and close() has not yet been called.
        """
        return self._connected

    def start(self):
        """
        Launch SUMO as a subprocess and establish the TraCI connection.

        Builds the SUMO command line entirely from values already
        resolved in Config, no path or binary name is constructed here.
        """
        sumo_binary = self._config.get_sumo_binary()
        sumo_cmd = [sumo_binary, "-c", self._config.SUMOCFG_PATH]

        logger.info("Starting SUMO...")
        traci.start(sumo_cmd)
        self._connected = True
        logger.info("Connected to TraCI")

    def run(self, callback=None):
     """
    Step the simulation until completion. Optionally invoke a callback
    after every simulation step.

    Parameters
    ----------
    callback : Callable | None
        Function executed after each successful simulation step.
     """
     if not self._connected:
        raise RuntimeError(
            "TraCI is not connected. Call start() before run()."
        )

     logger.info("Simulation started")

     try:
        while traci.simulation.getMinExpectedNumber() > 0:
            traci.simulationStep()

            if callback:
                callback()

        logger.info("Simulation finished")

     except FatalTraCIError:
        logger.info(
            "SUMO window was closed by the user. Stopping simulation gracefully."
        )

    def close(self):
     """
     Close the TraCI connection safely.

     Safe to call unconditionally from a finally block. If the SUMO
     window has already been closed by the user, TraCI may already have
     disconnected, in which case the resulting FatalTraCIError is treated
     as a normal shutdown condition rather than an application error.
     """
     if not self._connected:
        return

     try:
        traci.close()
        logger.info("TraCI closed")

     except FatalTraCIError:
        logger.info(
            "TraCI connection was already closed by SUMO."
        )

     finally:
        self._connected = False
            