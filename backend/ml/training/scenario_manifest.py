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
launched or how rows are collected.

Two kinds of Scenario, as of the second training milestone:

1. Procedural (flow_rates set): a per-lane vehsPerHour demand profile.
   Route IDs match the ones already defined in the frozen
   intersection.rou.xml (route_N_S, route_N_E, and so on).
   generate_scenario_files.py builds a scenario-specific .rou.xml from
   these rates (now with a realistic multi-vehicle-class mix and small
   per-seed demand jitter, see that module), the network and lane
   connections themselves are never touched.

2. Prebuilt (source_rou_xml set): points at an already-existing,
   hand-authored .rou.xml under sumo/scenarios/demo/ - the same 5 files
   used for VAC-vs-AI visual benchmarking - instead of generating one.
   generate_scenario_files.py writes only seed-variant .sumocfg files
   for these, it never touches or duplicates the source route file.
   Added in the second training milestone: these were excluded
   previously because they needed vClass="emergency" vehicle types and
   <stop>-based lane blocking that did not exist in the frozen route
   file at the time. Both now exist (see vehicle_types.add.xml and
   accident.rou.xml), so that exclusion reason no longer applies, and
   the Performance Evaluation module benchmarks VAC vs AI specifically
   on Normal/Rush Hour/Accident scenarios (execution guide Section
   14.4) - the model needs to have learned these dynamics, not be blind
   to them.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple


@dataclass(frozen=True)
class Scenario:
    """
    A single named traffic demand profile.

    Exactly one of `flow_rates` or `source_rou_xml` must be set - see
    __post_init__. Every other field applies to both kinds unless noted.

    Attributes
    ----------
    name : str
        Unique scenario name, used as a filename stem and as the
        run_id / scenario_name column in generated datasets.
    description : str
        Human readable explanation of what this scenario represents.
    flow_rates : Dict[str, float] | None
        Procedural scenarios only. Maps each of the 12 existing route
        IDs to a base vehsPerHour value. Any route omitted defaults to 0
        (no demand on that movement). generate_scenario_files.py applies
        a small per-seed jitter on top of these base rates and splits
        each route's total across the realistic vehicle-class mix - see
        that module for both.
    seeds : Tuple[int, ...]
        Random seeds this scenario is run with. Each seed is treated as
        an independent run for dataset-splitting purposes. For
        procedural scenarios, the seed also drives the demand jitter
        (not only SUMO's internal arrival realization), so seeds now
        genuinely vary the traffic level the model sees, not only the
        arrival pattern at one fixed level.
    is_dynamic : bool
        True if this scenario's demand changes over the course of the
        run (a ramp, a pulse, or multiple phases) rather than staying
        constant. Documentation/filtering only. Every prebuilt scenario
        that has phases (rush_hour) is dynamic by construction; no
        procedural scenario currently is (see the module docstring in
        generate_scenario_files.py for why phase support was not added
        to the procedural generator - the prebuilt rush_hour scenario
        already covers this need).
    source_rou_xml : str | None
        Prebuilt scenarios only. Path to the existing .rou.xml, relative
        to the project root (e.g. "sumo/scenarios/demo/accident.rou.xml").
        Never modified, never copied - referenced directly from a
        generated sumocfg.
    source_additional_files : Tuple[str, ...]
        Prebuilt scenarios only. Any additional-files this scenario's
        original demo sumocfg loads beyond vehicle_types.add.xml (which
        every scenario, procedural or prebuilt, always loads), given as
        project-root-relative paths. E.g. accident needs
        accident_slowzone.add.xml, rain needs
        vehicle_types_wet_weather.add.xml.
    source_end_seconds : int
        Prebuilt scenarios only. The simulation end time, matching what
        the original demo .sumocfg already uses for this route file
        (all five demo scenarios use 800s).
    held_out_seeds : Tuple[int, ...]
        Seeds from this scenario's own `seeds` that are excluded from
        BOTH training and the chronological test split, and routed
        instead into the same held-out bucket as
        TrainingConfig.HELD_OUT_SCENARIO_NAME (see dataset_builder.py).
        Distinct from holding out the whole scenario: the remaining,
        non-held-out seeds still train normally, so the model gets
        practical exposure to this scenario's pattern, while the
        held-out seed(s) give a genuine "has this generalized to a
        fresh, never-trained-on instance of this scenario" check,
        rather than only a chronological continuation of a run it
        already partly trained on. Must be a subset of `seeds`.
    """

    name: str
    description: str
    flow_rates: Optional[Dict[str, float]] = None
    seeds: Tuple[int, ...] = (1, 2, 3)
    is_dynamic: bool = False
    source_rou_xml: Optional[str] = None
    source_additional_files: Tuple[str, ...] = field(default_factory=tuple)
    source_end_seconds: int = 800
    held_out_seeds: Tuple[int, ...] = field(default_factory=tuple)

    def __post_init__(self):
        has_flow_rates = self.flow_rates is not None
        has_source = self.source_rou_xml is not None
        if has_flow_rates == has_source:
            raise ValueError(
                "Scenario '{}' must set exactly one of flow_rates or "
                "source_rou_xml (got flow_rates={}, source_rou_xml={}).".format(
                    self.name, self.flow_rates, self.source_rou_xml
                )
            )
        unknown_held_out = set(self.held_out_seeds) - set(self.seeds)
        if unknown_held_out:
            raise ValueError(
                "Scenario '{}' lists held_out_seeds={} not present in its "
                "own seeds={}.".format(self.name, self.held_out_seeds, self.seeds)
            )


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
    # ===================== Procedural scenarios (unchanged demand shape,
    # now with a realistic multi-vehicle-class mix and per-seed jitter
    # applied by generate_scenario_files.py) =====================
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

    # ===================== Prebuilt scenarios (added in the second
    # training milestone - the same 5 hand-authored demo files used for
    # VAC-vs-AI visual benchmarking, referenced directly, never
    # modified or duplicated) =====================
    Scenario(
        name="normal_traffic",
        description="Realistic, balanced, non-peak demand across all four "
                     "approaches with proper turn-lane volumes (~65-70% of "
                     "the straight movement on each approach). The training "
                     "set's closest procedural equivalent is 'balanced', but "
                     "that one has zero turn traffic dynamics (uniform "
                     "flow across all 12 routes looks nothing like a real "
                     "channelized approach's through/turn split) - this "
                     "scenario is what actually teaches that shape.",
        source_rou_xml="sumo/scenarios/demo/normal_traffic.rou.xml",
    ),
    Scenario(
        name="rush_hour",
        description="Three-phase (low 0-120s / peak 120-400s / taper "
                     "400-700s) demand ramp - genuine build-up and drain "
                     "dynamics that every procedural scenario above lacks "
                     "entirely (they are all flat for their full duration). "
                     "This is the single most important addition for the "
                     "low-confidence-under-heavy-load problem: previously "
                     "the model had only ever seen isolated steady states "
                     "(e.g. 'heavy' is 320 vph for the whole run), never a "
                     "transition between density levels within one run.",
        source_rou_xml="sumo/scenarios/demo/rush_hour.rou.xml",
        is_dynamic=True,
    ),
    Scenario(
        name="emergency_response",
        description="Ordinary background traffic plus discrete, "
                     "individually-scheduled emergency vehicle appearances "
                     "(ambulance/fire_engine/police_vehicle). Previously "
                     "excluded because vClass=\"emergency\" vehicle types "
                     "did not exist in the frozen route file - they do now. "
                     "Seed 3 is held out entirely (see held_out_seeds) so "
                     "there is a genuine, never-trained-on generalization "
                     "check for this scenario, not just practical training "
                     "exposure from seeds 1-2.",
        source_rou_xml="sumo/scenarios/demo/emergency_response.rou.xml",
        held_out_seeds=(3,),
    ),
    Scenario(
        name="accident",
        description="A stalled truck blocks the East approach's straight "
                     "lane via a <stop> element, plus a variableSpeedSign "
                     "forcing a genuine crawl across all three East lanes "
                     "while it's blocked (see accident_slowzone.add.xml). "
                     "Previously excluded because lane-blocking did not "
                     "exist in the frozen route file - it does now, and "
                     "the Performance Evaluation module benchmarks VAC vs "
                     "AI specifically on an Accident scenario (execution "
                     "guide Section 14.4), so the model needs to have "
                     "learned this pattern, not be blind to it. Seed 3 is "
                     "held out entirely (see held_out_seeds): a "
                     "chronological test split from the same accident run "
                     "the model trained on only proves it can continue a "
                     "run it has already partly seen, not that it "
                     "generalizes to a fresh accident instance - training "
                     "on seeds 1-2 for practical performance while holding "
                     "out seed 3 for a genuine, scientifically defensible "
                     "generalization check gets both.",
        source_rou_xml="sumo/scenarios/demo/accident.rou.xml",
        source_additional_files=("sumo/scenarios/demo/accident_slowzone.add.xml",),
        held_out_seeds=(3,),
    ),
    Scenario(
        name="rain",
        description="Same demand shape/volume as normal_traffic, but every "
                     "vehicle uses the wet-weather vType variants (lower "
                     "maxSpeed, higher sigma, lower accel/decel - see "
                     "vehicle_types_wet_weather.add.xml). Teaches the model "
                     "that a given vehicle count can correspond to a "
                     "different speed/waiting-time profile under different "
                     "driving-physics conditions, not just different demand.",
        source_rou_xml="sumo/scenarios/demo/rain.rou.xml",
        source_additional_files=("sumo/vehicles/vehicle_types_wet_weather.add.xml",),
    ),
)

# Scenarios NOT included above, and why:
# Road closure and construction scenarios are still excluded - they are
# genuinely not built yet anywhere in this project (no demo scenario
# for them either), unlike accident/emergency/rain which now exist and
# were only excluded here due to a now-resolved technical blocker.


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