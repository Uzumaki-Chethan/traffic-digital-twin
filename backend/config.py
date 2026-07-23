"""Configuration values for the traffic digital twin backend."""

APP_NAME = "traffic-digital-twin"
APP_VERSION = "0.1.0"
HOST = "0.0.0.0"
PORT = 8000
DEBUG = True
"""
config.py
=========
Single source of truth for every path and setting used by the TraCI
communication layer. No other module in this project should construct a
path or a SUMO binary name itself, everything asks Config for it. This is
what keeps app.py and traci_manager.py free of hardcoded paths, and is
what lets the whole backend be moved or deployed without editing any
function body.
"""

import os
import sumolib


class Config:
    """
    Centralised configuration. Implemented as a class with class level
    attributes, computed once at import time, rather than scattered
    module level constants, so every setting has a single documented
    home and can be extended later (for example, swapping in an
    environment specific subclass) without touching the rest of the
    backend.
    """

    # Root of the whole project, backend/ sits one level below this,
    # sumo/ sits alongside backend/. Computed relative to this file so it
    # is correct no matter where the project is checked out.
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # The frozen SUMO configuration file, never edited by this module.
    SUMOCFG_PATH = os.path.join(PROJECT_ROOT, "sumo", "config", "intersection.sumocfg")

    # "sumo-gui" for a visible simulation window during development and
    # demos, "sumo" for a headless run. sumolib resolves this to the
    # correct executable name and path for the current platform.
    SUMO_BINARY_NAME = "sumo-gui"

    # Logging configuration, read once by app.py at startup.
    LOG_LEVEL = "INFO"
    LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
    LOG_DATE_FORMAT = "%H:%M:%S"

    @classmethod
    def get_sumo_binary(cls):
        """
        Resolve the actual SUMO executable path for this platform.

        Uses sumolib.checkBinary, which looks at the SUMO_HOME
        environment variable (and the system PATH as a fallback) to find
        the correct binary, adding the .exe suffix on Windows
        automatically. Raising a clear error here, at configuration
        resolution time, means a missing SUMO installation is reported
        once with an actionable message, rather than surfacing later as
        a confusing TraCI connection failure.
        """
        try:
            return sumolib.checkBinary(cls.SUMO_BINARY_NAME)
        except Exception as exc:
            raise RuntimeError(
                "Could not locate the SUMO binary '{}'. Make sure SUMO is "
                "installed and the SUMO_HOME environment variable is set, "
                "or that SUMO is available on the system PATH.".format(
                    cls.SUMO_BINARY_NAME
                )
            ) from exc

    @classmethod
    def validate(cls):
        """
        Confirm the frozen sumocfg actually exists before anything tries
        to launch SUMO against it. Called once by app.py at startup.
        """
        if not os.path.isfile(cls.SUMOCFG_PATH):
            raise FileNotFoundError(
                "SUMO configuration file not found at: {}".format(cls.SUMOCFG_PATH)
            )