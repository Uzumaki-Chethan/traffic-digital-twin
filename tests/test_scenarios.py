"""
test_scenarios.py
==================
The scenario registry (backend/performance/scenarios.py): the one place a
scenario id becomes a .sumocfg path. Every start route validates against
it before a name reaches SUMO.

Run from backend/:  pytest ../tests/test_scenarios.py
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest

from config import Config
from performance.scenarios import (
    DEFAULT_SCENARIO,
    is_known_scenario,
    known_scenario_names,
    scenario_sumocfg_path,
)


def test_known_names_are_the_sumocfg_basenames():
    names = known_scenario_names()
    assert "light_seed1" in names and "extreme_seed2" in names
    assert all(not n.endswith(".sumocfg") for n in names)


def test_default_maps_to_the_production_route():
    assert scenario_sumocfg_path(DEFAULT_SCENARIO) == Config.SUMOCFG_PATH
    assert is_known_scenario(DEFAULT_SCENARIO)


def test_named_scenario_maps_to_its_file():
    p = scenario_sumocfg_path("light_seed1")
    assert p.endswith(os.path.join("scenarios", "light_seed1.sumocfg"))
    assert os.path.isfile(p)


def test_unknown_scenario_is_rejected():
    assert not is_known_scenario("../../evil")
    with pytest.raises(ValueError):
        scenario_sumocfg_path("../../evil")
