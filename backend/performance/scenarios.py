"""
scenarios.py
=============
The one place a scenario id becomes a .sumocfg path.

Both start routes in services/control_routes.py (the demo run and the
in-process evaluation) validate a requested name against
known_scenario_names() before it can ever reach SUMO, and
performance.evaluator resolves its config file here too - so there is
exactly one answer to "which scenarios exist" and "where is this one".

DEFAULT_SCENARIO is the frozen production route (sumo/config/
intersection.sumocfg - what `python app.py` has always run): balanced
480 veh/h per approach with the realistic vehicle mix, 600 s. It is
what a demo run uses when no scenario is named. The evaluator never
uses it: an evaluation needs a scenario from the library.
"""

import glob
import os

from config import Config

DEFAULT_SCENARIO = "default"
SCENARIO_DIR = os.path.join(Config.PROJECT_ROOT, "sumo", "config", "scenarios")


def known_scenario_names() -> set:
    """Every `<name>.sumocfg` under sumo/config/scenarios, by name."""
    return {
        os.path.splitext(os.path.basename(path))[0]
        for path in glob.glob(os.path.join(SCENARIO_DIR, "*.sumocfg"))
    }


def is_known_scenario(name: str) -> bool:
    return name == DEFAULT_SCENARIO or name in known_scenario_names()


def scenario_sumocfg_path(name: str) -> str:
    """
    Absolute path of the .sumocfg for `name`. Raises ValueError for a name
    that is not in the library - callers turn that into an HTTP 400, and
    nothing user-supplied is ever joined into a path without this check.
    """
    if name == DEFAULT_SCENARIO:
        return Config.SUMOCFG_PATH
    if name not in known_scenario_names():
        raise ValueError("Unknown scenario {!r}".format(name))
    return os.path.join(SCENARIO_DIR, "{}.sumocfg".format(name))
