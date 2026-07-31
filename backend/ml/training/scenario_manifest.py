"""
scenario_manifest.py
======================
The declarative list of traffic scenarios used to generate the training
dataset. This is data, not orchestration logic, adding a scenario means
adding an entry here, not changing dataset_generator.py.

Implemented as plain Python dataclasses rather than a YAML/JSON file.
That is a deliberate, lightweight choice: it avoids adding a parsing
dependency for what is currently a short, project-internal list, while
still keeping the manifest itself free of any orchestration code, a
Scenario here is pure data describing demand, nothing about how SUMO is
launched or how rows are collected. If this list grows large enough that
non-developers need to edit it, moving it to YAML at that point is a
small, isolated change, this module's shape would not need to change.

Each Scenario describes a per-lane vehsPerHour demand profile. Route IDs
match the ones already defined in the frozen intersection.rou.xml
(route_N_S, route_N_E, and so on), demand values here are used to
generate a scenario-specific .rou.xml with the same routes but different
flow rates, the network and lane connections themselves are never
touched.
"""

from dataclasses import dataclass, field
from typing import Dict, Tuple


@dataclass(frozen=True)
class Scenario:
    """
    A single named traffic demand profile.

    Attributes
    ----------
    name : str
        Unique scenario name, used as a filename stem and as the
        run_id / scenario_name column in generated datasets.
    description : str
        Human readable explanation of what this scenario represents.
    flow_rates : Dict[str, float]
        Maps each of the 12 existing route IDs (route_N_S, route_N_E,
        route_N_W, route_S_N, ...) to a vehsPerHour value for this
        scenario. Any route omitted defaults to 0 (no demand on that
        movement for this scenario).
    seeds : Tuple[int, ...]
        Random seeds this scenario is run with. Each seed is treated as
        an independent run for dataset-splitting purposes, this is what
        prevents the dataset from overfitting to one arbitrary random
        vehicle-arrival trajectory per scenario.
    is_dynamic : bool
        True if this scenario's demand changes over the course of the
        run (a ramp or a pulse) rather than staying constant, used only
        for documentation/filtering purposes, does not change how the
        scenario is processed downstream.
    """

    name: str
    description: str
    flow_rates: Dict[str, float]
    seeds: Tuple[int, ...] = (1, 2, 3)
    is_dynamic: bool = False


# The 12 routes already defined in the frozen intersection.rou.xml.
_ALL_ROUTES = (
    "route_N_S", "route_N_E", "route_N_W",
    "route_S_N", "route_S_E", "route_S_W",
    "route_E_W", "route_E_N", "route_E_S",
    "route_W_E", "route_W_N", "route_W_S",
)


def _uniform(rate: float) -> Dict[str, float]:
    """Convenience builder: the same vehsPerHour on every route."""
    return {route: rate for route in _ALL_ROUTES}


def _directional_heavy(heavy_direction_routes: Tuple[str, ...], heavy_rate: float,
                        base_rate: float) -> Dict[str, float]:
    """
    Convenience builder: one approach's 3 routes get heavy_rate, every
    other route gets base_rate.
    """
    rates = _uniform(base_rate)
    for route in heavy_direction_routes:
        rates[route] = heavy_rate
    return rates


SCENARIOS: Tuple[Scenario, ...] = (
    Scenario(
        name="light",
        description="Low, uniform demand on every approach.",
        flow_rates=_uniform(80.0),
    ),
    Scenario(
        name="balanced",
        description="Moderate, uniform demand on every approach, matching "
                     "the original baseline flows used since project setup.",
        flow_rates=_uniform(160.0),
    ),
    Scenario(
        name="heavy",
        description="Heavy, uniform demand on every approach.",
        flow_rates=_uniform(320.0),
    ),
    Scenario(
        name="extreme",
        description="Very heavy, uniform demand on every approach. Held "
                     "out entirely from training as an out-of-distribution "
                     "generalization check, see TrainingConfig.HELD_OUT_SCENARIO_NAME.",
        flow_rates=_uniform(480.0),
        seeds=(1, 2),
    ),
    Scenario(
        name="north_heavy",
        description="North approach heavily loaded, every other approach "
                     "at light demand.",
        flow_rates=_directional_heavy(
            ("route_N_S", "route_N_E", "route_N_W"), heavy_rate=400.0, base_rate=100.0
        ),
    ),
    Scenario(
        name="south_heavy",
        description="South approach heavily loaded, every other approach "
                     "at light demand.",
        flow_rates=_directional_heavy(
            ("route_S_N", "route_S_E", "route_S_W"), heavy_rate=400.0, base_rate=100.0
        ),
    ),
    Scenario(
        name="east_heavy",
        description="East approach heavily loaded, every other approach "
                     "at light demand.",
        flow_rates=_directional_heavy(
            ("route_E_W", "route_E_N", "route_E_S"), heavy_rate=400.0, base_rate=100.0
        ),
    ),
    Scenario(
        name="west_heavy",
        description="West approach heavily loaded, every other approach "
                     "at light demand.",
        flow_rates=_directional_heavy(
            ("route_W_E", "route_W_N", "route_W_S"), heavy_rate=400.0, base_rate=100.0
        ),
    ),
)

# Scenarios NOT included above, and why:
#
# Emergency vehicle / road closure / accident / construction scenarios
# are deliberately excluded from this milestone. They require TraCI
# triggered lane closures, priority vehicle types, or route/network
# features that do not exist in the frozen intersection.con.xml /
# intersection.rou.xml today. Adding them here would misrepresent them
# as a data-only change when they actually require new network/route
# work first, see the architecture review for details.
#
# Dynamic scenarios (a demand ramp or a rush-hour pulse) are also not
# included in this first version of the manifest. The Scenario dataclass
# above already supports is_dynamic as a flag for when they are added,
# generating a genuinely time-varying .rou.xml (multiple <flow> elements
# per route with different begin/end windows) is a small, isolated
# extension to the route-generation script, not a change to this
# manifest's shape.


def get_scenario_by_name(name: str) -> Scenario:
    """
    Look up a scenario by name.

    Raises
    ------
    KeyError
        If no scenario with the given name exists in SCENARIOS.
    """
    for scenario in SCENARIOS:
        if scenario.name == name:
            return scenario
    raise KeyError(
        "No scenario named '{}' in the manifest. Known scenarios: {}".format(
            name, [s.name for s in SCENARIOS]
        )
    )