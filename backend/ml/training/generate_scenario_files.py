"""
generate_scenario_files.py
============================
Generates .rou.xml and .sumocfg files for every (scenario, seed)
combination in the manifest, from scenario_manifest.SCENARIOS. Never
touches the frozen network (intersection.nod.xml, .edg.xml, .con.xml,
.tll.xml, .net.xml), the original intersection.rou.xml, or any of the
hand-authored demo scenario files under sumo/scenarios/demo/. Writes
only into sumo/routes/scenarios/ and sumo/config/scenarios/.

Two generation paths, matching scenario_manifest.Scenario's two kinds:

1. Procedural (scenario.flow_rates set): one .rou.xml per (scenario,
   seed) - previously one .rou.xml shared across all seeds of a
   scenario, now one per seed because seed-level demand jitter (see
   _jitter_rate) makes the route file itself seed-dependent, not only
   SUMO's internal arrival realization.

   Second training milestone changes to this path:
     - Flows now reference the real vehicle_types.add.xml vType ids
       (car, motorcycle, auto_rickshaw, bus, truck) via a realistic
       mix (see _VTYPE_MIX), instead of a single hardcoded inline
       <vType id="car" .../> block. That inline block was a duplicate
       of definitions already owned by vehicle_types.add.xml - a drift
       risk on its own - and meant every procedurally-generated
       training run had zero non-car traffic, while every demo
       scenario and the frozen intersection.rou.xml have a full mix.
       Referencing the real file directly removes both problems at
       once.
     - Each route's base rate is jittered by up to +-10% per seed (see
       _jitter_rate), deterministically from that seed, so three seeds
       of "heavy" no longer all train the model on the exact same
       320 vph - they train it on a small range of nearby densities,
       which is what "learn the distribution, not a fixed value" (the
       actual justification for using multiple seeds at all) is
       supposed to mean. Previously seeds only varied SUMO's internal
       arrival-time realization at one exact rate.
     - Simulation end time raised 600 -> 800, matching every demo
       scenario, giving more rows per run and, on the 700-800s tail,
       room for demand-independent settling behaviour to appear in the
       data (nothing new is injected in that window, existing traffic
       simply continues and can drain).

2. Prebuilt (scenario.source_rou_xml set): no route file is generated
   at all - one .sumocfg per seed is written, pointing directly at the
   existing, unmodified source .rou.xml plus vehicle_types.add.xml and
   any scenario.source_additional_files. Added in the second training
   milestone so the 5 hand-authored demo scenarios (normal_traffic,
   rush_hour, emergency_response, accident, rain) can be included in
   training without duplicating a single line of their content.

Run directly:
    python -m ml.training.generate_scenario_files
"""

import os
import random

from ml.training.config import TrainingConfig
from ml.training.scenario_manifest import SCENARIOS, Scenario

# Route ID -> (edges) copied verbatim from the frozen intersection.rou.xml.
# Kept here, not re-parsed from the XML file, so this script has no
# dependency on being able to parse the frozen route file's exact
# formatting, only on the route topology, which is part of the frozen
# network's design and will not change independently of it.
_ROUTE_EDGES = {
    "route_N_S": "N_in C_out_S",
    "route_N_E": "N_in C_out_E",
    "route_N_W": "N_in C_out_W",
    "route_S_N": "S_in C_out_N",
    "route_S_E": "S_in C_out_E",
    "route_S_W": "S_in C_out_W",
    "route_E_W": "E_in C_out_W",
    "route_E_N": "E_in C_out_N",
    "route_E_S": "E_in C_out_S",
    "route_W_E": "W_in C_out_E",
    "route_W_N": "W_in C_out_N",
    "route_W_S": "W_in C_out_S",
}

_SIMULATION_END_SECONDS = 800
_STEP_LENGTH_SECONDS = 0.05

# Realistic vehicle-class split applied to every procedural route's
# total demand, matching the mix used across the demo scenarios and
# the frozen intersection.rou.xml, rather than the previous 100% car.
# Sums to 1.0. Vehicle type ids match vehicle_types.add.xml exactly.
_VTYPE_MIX = {
    "car": 0.55,
    "motorcycle": 0.30,
    "auto_rickshaw": 0.08,
    "bus": 0.04,
    "truck": 0.03,
}

# Maximum fractional demand jitter applied per (scenario, seed), see
# _jitter_rate. +-10%, as a round, defensible number: large enough to
# give the model genuinely different density levels across the seeds
# of one scenario (not just a different arrival-time realization at an
# identical level), small enough that "heavy" and "extreme" never
# overlap into each other's range (heavy=320+-10%=288-352,
# extreme=480+-10%=432-528 - a clear gap remains between them, so the
# jitter adds within-scenario variation without blurring the
# between-scenario boundaries the scenario names are supposed to mean).
_JITTER_FRACTION = 0.10


def _run_id(scenario: Scenario, seed: int) -> str:
    return "{}_seed{}".format(scenario.name, seed)


def _jitter_rate(rate: float, scenario_name: str, seed: int) -> float:
    """
    Deterministically jitter a base vehsPerHour rate by up to
    +-_JITTER_FRACTION, seeded from (scenario_name, seed) so the same
    (scenario, seed) always regenerates the identical jittered rate
    (reproducibility is preserved - re-running generate_all() does not
    silently change already-correct output), while different seeds of
    the same scenario get different, but consistent, jitter.
    """
    rng = random.Random("{}::{}".format(scenario_name, seed))
    factor = 1.0 + rng.uniform(-_JITTER_FRACTION, _JITTER_FRACTION)
    return rate * factor


def _relative_path(project_root_relative_path: str) -> str:
    """
    Convert a project-root-relative path (e.g.
    "sumo/scenarios/demo/accident.rou.xml") into a path relative to
    TrainingConfig.SCENARIO_CONFIGS_DIR (where the generated sumocfg
    lives), using os.path.relpath so this is correct regardless of the
    exact directory depth on either side, rather than hand-written
    "../../" strings that would silently break if either directory
    ever moved. Normalized to forward slashes for the XML value, since
    every other generated/hand-authored file in this project uses
    forward slashes regardless of host OS.
    """
    absolute_target = os.path.join(TrainingConfig.PROJECT_ROOT, project_root_relative_path)
    relative = os.path.relpath(absolute_target, TrainingConfig.SCENARIO_CONFIGS_DIR)
    return relative.replace(os.sep, "/")


def _build_route_xml(scenario: Scenario, seed: int) -> str:
    """
    Build a .rou.xml file's contents for one (scenario, seed): the same
    route definitions as the frozen route file, with each route's base
    vehsPerHour jittered per-seed and split across the realistic
    vehicle-class mix. vType definitions themselves are NOT written
    here - they come from vehicle_types.add.xml, loaded as an
    additional-file by the generated sumocfg (see _build_sumocfg_xml),
    so this file has exactly one authoritative source, not two.
    """
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<!--",
        "    Generated by ml/training/generate_scenario_files.py for",
        "    scenario '{}', seed {}. {}".format(scenario.name, seed, scenario.description),
        "    Do not hand edit, regenerate from scenario_manifest.py instead.",
        "    Vehicle types come from vehicle_types.add.xml (loaded via this",
        "    run's sumocfg), not defined in this file.",
        "-->",
        "<routes>",
    ]
    for route_id, edges in _ROUTE_EDGES.items():
        lines.append('    <route id="{}" edges="{}"/>'.format(route_id, edges))
    lines.append("")

    for route_id in _ROUTE_EDGES:
        base_rate = scenario.flow_rates.get(route_id, 0.0)
        if base_rate <= 0.0:
            continue
        jittered_rate = _jitter_rate(base_rate, scenario.name, seed)
        for vtype_id, fraction in _VTYPE_MIX.items():
            vtype_rate = jittered_rate * fraction
            if vtype_rate <= 0.0:
                continue
            flow_id = "flow_{}_{}".format(route_id, vtype_id)
            lines.append(
                '    <flow id="{}" type="{}" route="{}" begin="0" '
                'end="{}" vehsPerHour="{:.3f}"/>'.format(
                    flow_id, vtype_id, route_id, _SIMULATION_END_SECONDS, vtype_rate
                )
            )
    lines.append("</routes>")
    return "\n".join(lines) + "\n"


def _build_sumocfg_xml_procedural(scenario: Scenario, seed: int, route_filename: str) -> str:
    """
    Build a .sumocfg for one procedurally-generated (scenario, seed)
    run: the frozen network, this run's generated route file, and
    vehicle_types.add.xml (every procedural run now needs this, since
    _build_route_xml no longer defines vTypes inline).
    """
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!--\n"
        "    Generated by ml/training/generate_scenario_files.py for\n"
        "    scenario '{scenario_name}', seed {seed}.\n"
        "    Points at the frozen network, never modifies it.\n"
        "-->\n"
        "<configuration>\n"
        "    <input>\n"
        '        <net-file value="../../network/intersection.net.xml"/>\n'
        '        <route-files value="../../routes/scenarios/{route_filename}"/>\n'
        '        <additional-files value="{vehicle_types_path}"/>\n'
        "    </input>\n"
        "    <time>\n"
        '        <begin value="0"/>\n'
        '        <end value="{end}"/>\n'
        '        <step-length value="{step_length}"/>\n'
        "    </time>\n"
        "    <random>\n"
        '        <seed value="{seed}"/>\n'
        "    </random>\n"
        "</configuration>\n"
    ).format(
        scenario_name=scenario.name,
        seed=seed,
        route_filename=route_filename,
        vehicle_types_path=_relative_path("sumo/vehicles/vehicle_types.add.xml"),
        end=_SIMULATION_END_SECONDS,
        step_length=_STEP_LENGTH_SECONDS,
    )


def _build_sumocfg_xml_prebuilt(scenario: Scenario, seed: int) -> str:
    """
    Build a .sumocfg for one prebuilt (scenario, seed) run: points
    directly at scenario.source_rou_xml (never copied or modified),
    plus vehicle_types.add.xml and any scenario.source_additional_files,
    with only the <seed> varying between this scenario's runs (the
    source route file's demand itself is fixed - these scenarios were
    hand-authored for a specific, validated visual/behavioural effect,
    e.g. accident's blockage timing, so they are not jittered the way
    procedural scenarios are).
    """
    additional_paths = [_relative_path("sumo/vehicles/vehicle_types.add.xml")]
    additional_paths.extend(
        _relative_path(path) for path in scenario.source_additional_files
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!--\n"
        "    Generated by ml/training/generate_scenario_files.py for\n"
        "    scenario '{scenario_name}', seed {seed}.\n"
        "    Points directly at the hand-authored demo route file at\n"
        "    {source_rou_xml}, which this script never modifies or\n"
        "    duplicates. Only this file (a thin, generated sumocfg) is\n"
        "    new.\n"
        "-->\n"
        "<configuration>\n"
        "    <input>\n"
        '        <net-file value="../../network/intersection.net.xml"/>\n'
        '        <route-files value="{route_files_path}"/>\n'
        '        <additional-files value="{additional_files_value}"/>\n'
        "    </input>\n"
        "    <time>\n"
        '        <begin value="0"/>\n'
        '        <end value="{end}"/>\n'
        '        <step-length value="{step_length}"/>\n'
        "    </time>\n"
        "    <random>\n"
        '        <seed value="{seed}"/>\n'
        "    </random>\n"
        "</configuration>\n"
    ).format(
        scenario_name=scenario.name,
        seed=seed,
        source_rou_xml=scenario.source_rou_xml,
        route_files_path=_relative_path(scenario.source_rou_xml),
        additional_files_value=",".join(additional_paths),
        end=scenario.source_end_seconds,
        step_length=_STEP_LENGTH_SECONDS,
    )


def generate_all() -> None:
    """
    Generate route/config files for every (scenario, seed) combination
    in the manifest.

    Procedural scenarios: one .rou.xml and one .sumocfg per seed.
    Prebuilt scenarios: no .rou.xml (the source file is used as-is),
    one .sumocfg per seed.
    """
    TrainingConfig.ensure_output_directories()

    route_files_written = 0
    sumocfg_files_written = 0

    for scenario in SCENARIOS:
        if scenario.source_rou_xml is not None:
            source_path = os.path.join(TrainingConfig.PROJECT_ROOT, scenario.source_rou_xml)
            if not os.path.isfile(source_path):
                raise FileNotFoundError(
                    "Scenario '{}' points at source_rou_xml={}, which does not "
                    "exist at {}.".format(scenario.name, scenario.source_rou_xml, source_path)
                )
            for path in scenario.source_additional_files:
                absolute = os.path.join(TrainingConfig.PROJECT_ROOT, path)
                if not os.path.isfile(absolute):
                    raise FileNotFoundError(
                        "Scenario '{}' lists source_additional_files entry {}, "
                        "which does not exist at {}.".format(scenario.name, path, absolute)
                    )
            for seed in scenario.seeds:
                run_id = _run_id(scenario, seed)
                sumocfg_path = os.path.join(
                    TrainingConfig.SCENARIO_CONFIGS_DIR, "{}.sumocfg".format(run_id)
                )
                with open(sumocfg_path, "w", encoding="utf-8") as f:
                    f.write(_build_sumocfg_xml_prebuilt(scenario, seed))
                sumocfg_files_written += 1
        else:
            for seed in scenario.seeds:
                run_id = _run_id(scenario, seed)
                route_filename = "{}.rou.xml".format(run_id)
                route_path = os.path.join(TrainingConfig.SCENARIO_ROUTES_DIR, route_filename)
                with open(route_path, "w", encoding="utf-8") as f:
                    f.write(_build_route_xml(scenario, seed))
                route_files_written += 1

                sumocfg_path = os.path.join(
                    TrainingConfig.SCENARIO_CONFIGS_DIR, "{}.sumocfg".format(run_id)
                )
                with open(sumocfg_path, "w", encoding="utf-8") as f:
                    f.write(_build_sumocfg_xml_procedural(scenario, seed, route_filename))
                sumocfg_files_written += 1

    print(
        "Generated {} route file(s) and {} sumocfg file(s) across {} scenario(s).".format(
            route_files_written, sumocfg_files_written, len(SCENARIOS)
        )
    )


if __name__ == "__main__":
    generate_all()