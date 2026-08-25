"""
traci_manager.py
================
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

    def __init__(self, config, label=None):
        """
        config: the Config class (or an instance of it) providing
        SUMOCFG_PATH and get_sumo_binary(). Passed in explicitly rather
        than imported directly, so this class has no hidden dependency
        on a specific config module and can be tested with a fake config.

        label: optional TraCI connection label. The traci library keeps
        one connection per label; leaving this None uses the default
        single-connection behaviour app.py has always had. Performance
        Evaluation passes distinct labels ("ai" / "baseline") because
        its two simulations MUST be separate SUMO processes with
        separate connections - sharing one connection would mean shared
        signal state, which would make the comparison meaningless.
        """
        self._config = config
        self._label = label
        self._connected = False
        self._connection = None

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

    @property
    def connection(self):
        """
        The live traci Connection object owned by this manager, or None
        before start(). Consumers that need to talk to THIS instance's
        SUMO process specifically (TrafficAdapter when two simulations
        run side by side) use this instead of the module-level default
        connection.
        """
        return self._connection

    def start(self):
        """
        Launch SUMO as a subprocess and establish the TraCI connection.

        Builds the SUMO command line entirely from values already
        resolved in Config, no path or binary name is constructed here.
        """
        sumo_binary = self._config.get_sumo_binary()
        sumo_cmd = [sumo_binary, "-c", self._config.SUMOCFG_PATH]

        logger.info("Starting SUMO...")
        # numRetries is raised above traci's default (10): on Windows the
        # sumo-gui process can take longer than that retry window to open
        # its command port, which surfaced as an intermittent
        # FatalTraCIError("Connection closed by SUMO.") at startup even
        # though SUMO itself was fine. 30 retries (~30s) comfortably
        # covers slow first-launch DLL loading without masking a genuinely
        # dead SUMO for long.
        # NOTE on this SUMO install's traci API: traci.start() returns a
        # (label, subprocess) tuple, NOT the Connection - the Connection
        # must be fetched afterwards via traci.getConnection(label).
        # Storing it lets TrafficAdapter / SignalController bind to THIS
        # SUMO process even while another labeled connection is open
        # simultaneously (Performance Evaluation's parallel runs).
        effective_label = self._label if self._label is not None else "default"
        traci.start(sumo_cmd, numRetries=30, label=effective_label)
        self._connection = traci.getConnection(effective_label)
        self._connected = True
        logger.info("Connected to TraCI (label=%s)", effective_label)

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

        # Bind to THIS manager's connection when it has its own (labeled
        # multi-instance runs); fall back to the module-level default
        # connection for the classic single-simulation app.py path.
        conn = self._connection if self._connection is not None else traci

        try:
            while conn.simulation.getMinExpectedNumber() > 0:
                conn.simulationStep()

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
            # Close THIS manager's own connection. Calling the
            # module-level traci.close() here would close the DEFAULT
            # connection and leave a labeled parallel simulation's SUMO
            # process dangling - exactly what Performance Evaluation
            # must never do.
            if self._connection is not None:
                self._connection.close()
            else:
                traci.close()
            logger.info("TraCI closed")

        except FatalTraCIError:
            logger.info(
                "TraCI connection was already closed by SUMO."
            )

        finally:
            self._connected = False
            self._connection = None
