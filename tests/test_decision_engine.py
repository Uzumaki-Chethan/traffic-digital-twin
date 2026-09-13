"""
test_decision_engine.py
=========================
Offline unit tests for DecisionEngine.decide() - no SUMO/TraCI process
involved anywhere in this file. decide() has no simulation dependency
by construction (see decision_engine.py's own module docstring on
separation of concerns), which is exactly what makes this possible and
is the test strategy the project execution guide's Section 14.1
prescribes.

Several tests construct a DecisionEngine with a custom DecisionConfig
(e.g. starvation_rate_per_second=0.0) specifically to isolate ONE
mechanism at a time - the real engine runs multiple adaptive
mechanisms simultaneously (hysteresis, starvation pressure, emergency
override), and with default tunables they can interact in ways that
would make a single test ambiguous about which mechanism it's actually
proving. Isolating via config, rather than deleting the other
mechanisms, is exactly what decision_config.py's tunability was built
for.

Run from the `backend/` directory (or with `backend/` on PYTHONPATH),
matching how the rest of the backend package imports itself, e.g.:
    cd backend && pytest ../tests/test_decision_engine.py -v
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from types import MappingProxyType

import pytest

from decision_engine.decision_config import DecisionConfig
from decision_engine.decision_engine import ALL_APPROACH_LANES, DecisionEngine
from models import (
    LaneFeatures,
    LanePrediction,
    SignalFeatures,
    TrafficFeatures,
    TrafficPrediction,
)

# ===================== Fixture builders =====================


def _lane_feature(
    lane_id: str, vehicle_count: int = 0, waiting_time: float = 0.0, departure_rate: float = 0.0
) -> LaneFeatures:
    return LaneFeatures(
        lane_id=lane_id,
        vehicle_count=vehicle_count,
        average_speed=5.0 if vehicle_count else 0.0,
        average_waiting_time=waiting_time,
        max_waiting_time=waiting_time,
        stopped_vehicle_count=vehicle_count if waiting_time > 0 else 0,
        arrival_rate=0.0,
        # Non-zero only where a test says the lane is discharging - the
        # preemption floor's gate (DecisionConfig.preemption_floor_min_departure_rate).
        departure_rate=departure_rate,
        stopped_vehicle_count_trend=0.0,
        waiting_time_trend=0.0,
    )


def make_features(demand: dict = None, simulation_time: float = 0.0) -> TrafficFeatures:
    """
    Build a TrafficFeatures snapshot covering all 12 ALL_APPROACH_LANES.
    `demand` maps lane_id -> (vehicle_count, waiting_time_seconds);
    unlisted lanes default to zero demand.
    """
    demand = demand or {}
    lane_features = {
        lane_id: _lane_feature(lane_id, *demand.get(lane_id, (0, 0.0)))
        for lane_id in ALL_APPROACH_LANES
    }
    # A third tuple element, when given, is the lane's departure_rate.
    return TrafficFeatures(
        simulation_time=simulation_time,
        total_vehicle_count=sum(lf.vehicle_count for lf in lane_features.values()),
        average_speed=5.0,
        average_waiting_time=0.0,
        stopped_vehicle_count=0,
        lane_features=MappingProxyType(lane_features),
        signal=SignalFeatures(
            seconds_in_current_phase=20.0,
            lane_signal_states=MappingProxyType({lane_id: 0 for lane_id in ALL_APPROACH_LANES}),
        ),
    )


def make_prediction(predicted_demand: dict, reference_time: float = 0.0) -> TrafficPrediction:
    """`predicted_demand` maps lane_id -> (predicted_count, predicted_wait, confidence_0_100)."""
    lane_predictions = {
        lane_id: LanePrediction(
            lane_id=lane_id, predicted_vehicle_count=count,
            predicted_average_waiting_time=wait, confidence=confidence,
        )
        for lane_id, (count, wait, confidence) in predicted_demand.items()
    }
    return TrafficPrediction(
        reference_time=reference_time, prediction_horizon_seconds=15.0,
        lane_predictions=MappingProxyType(lane_predictions),
    )


# ===================== Min/max green clamps =====================


def test_holds_below_min_green_even_with_strong_competing_demand():
    engine = DecisionEngine(initial_phase="NS_straight_left")
    features = make_features({"E_in_1": (20, 60.0), "W_in_1": (20, 60.0)})

    decision = engine.decide(features, None, dt_seconds=2.0)

    assert decision.switched is False
    assert decision.active_phase == "NS_straight_left"
    assert decision.decision_mode == "min_green_hold"


def test_switches_at_max_green_regardless_of_hysteresis():
    # NS_right's max green is 20s; with zero demand anywhere, hysteresis
    # alone would never switch away from it - only the max-green
    # ceiling should force a switch here.
    engine = DecisionEngine(initial_phase="NS_right")
    decision = engine.decide(make_features({}), None, dt_seconds=25.0)

    assert decision.switched is True
    assert decision.decision_mode == "priority"
    assert decision.active_phase != "NS_right"


# ===================== Hysteresis margin =====================


def _hysteresis_engine() -> DecisionEngine:
    # starvation_rate_per_second=0.0 isolates pure score-vs-margin
    # comparison from the separately-tested starvation mechanism below.
    return DecisionEngine(
        initial_phase="NS_straight_left",
        config=DecisionConfig(starvation_rate_per_second=0.0),
    )


def test_hysteresis_holds_a_marginally_better_alternative():
    engine = _hysteresis_engine()
    engine.decide(make_features({}), None, dt_seconds=20.0)  # clear min green (and the 20 s preemption floor)

    # EW_straight_left scores only marginally higher than NS_straight_left,
    # well inside the 0.08 base hysteresis margin.
    features = make_features({
        "S_in_1": (5, 0.0), "N_in_1": (5, 0.0),
        "E_in_1": (6, 0.0), "W_in_1": (6, 0.0),
    })
    decision = engine.decide(features, None, dt_seconds=1.0)

    assert decision.switched is False
    assert decision.active_phase == "NS_straight_left"


def test_hysteresis_switches_when_clearly_better():
    engine = _hysteresis_engine()
    engine.decide(make_features({}), None, dt_seconds=20.0)  # clear min green (and the 20 s preemption floor)

    # S_in_1/N_in_1 keep 1 vehicle each (not zero) specifically so this
    # exercises the confirmation-debounce path, not gap-out - a
    # genuinely-empty current phase is covered separately below.
    features = make_features({
        "S_in_1": (1, 0.0), "N_in_1": (1, 0.0),
        "E_in_1": (20, 60.0), "W_in_1": (20, 60.0),
    })
    decision = engine.decide(features, None, dt_seconds=1.0)
    assert decision.switched is False  # leads, but confirmation window not yet elapsed

    # Same clear lead sustained for the rest of the default 3s
    # confirmation window (engine.config.switch_confirmation_seconds).
    for _ in range(3):
        decision = engine.decide(features, None, dt_seconds=1.0)
        if decision.switched:
            break

    assert decision.switched is True
    assert decision.active_phase == "EW_straight_left"
    assert decision.decision_mode == "priority"


def test_oversaturation_widens_the_switch_margin():
    """
    Identical current-vs-best_other score gap in both runs; the only
    difference is background demand on the OTHER two (right-turn)
    phases' lanes, which raises congestion_index and should widen the
    effective hysteresis margin enough to suppress a switch that would
    otherwise happen under low background congestion.
    """
    def run(background_demand):
        # A single call combining "clear min green" and the real demand:
        # a separate, earlier empty-demand call would let the OTHER
        # phases' tiny default starvation pressure alone (0.01/s * 10s
        # = 0.1) exceed the 0.08 base margin against a truly zero
        # current-phase score, switching away before this comparison
        # ever runs - an artifact of the clearing step, not of what
        # this test is trying to isolate. switch_hysteresis_margin is
        # pinned back to the pre-tuning 0.08 (the shipped default is now
        # 0.25, empirically tuned against VAC - see decision_config.py -
        # which would swallow this test's ~0.16 score gap outright and
        # test nothing). light_traffic_congestion_threshold=0.0 keeps
        # light-traffic mode out of this test too (its own dedicated
        # tests cover it below).
        # min_green_before_preemption_seconds is pinned to the plain
        # min green here: this test isolates the margin arithmetic, and
        # the realistic-green floor (its own test below) would otherwise
        # hold BOTH runs regardless of congestion.
        engine = DecisionEngine(
            initial_phase="NS_straight_left",
            config=DecisionConfig(
                switch_hysteresis_margin=0.08, light_traffic_congestion_threshold=0.0,
                min_green_before_preemption_seconds={
                    "NS_straight_left": 10.0, "EW_straight_left": 10.0,
                    "NS_right": 8.0, "EW_right": 8.0,
                },
            ),
        )
        demand = {
            "S_in_1": (10, 0.0), "N_in_1": (10, 0.0),
            "E_in_1": (12, 0.0), "W_in_1": (12, 0.0),
        }
        demand.update(background_demand)
        return engine.decide(make_features(demand), None, dt_seconds=10.0)

    low_congestion = run({})
    # Left-turn lanes (S_in_0/N_in_0/E_in_0/W_in_0), not right-turn
    # lanes. Since left turns became protected (2026-09-13) each of these
    # belongs to one main phase, but they are loaded SYMMETRICALLY here -
    # NS gets S_in_0+N_in_0, EW gets E_in_0+W_in_0, all identical - so
    # congestion_index rises without changing the NS-vs-EW gap, and the
    # two right-turn phases still stay at 0. That is what this test needs;
    # the mechanism it relies on changed, the property it asserts did not.
    high_congestion = run({
        "S_in_0": (20, 60.0), "N_in_0": (20, 60.0),
        "E_in_0": (20, 60.0), "W_in_0": (20, 60.0),
    })

    assert low_congestion.switched is True
    assert high_congestion.switched is False


# ===================== Light-traffic mode =====================
# Disabled by default (light_traffic_congestion_threshold=0.0 - see
# decision_config.py's field comment for why), but the mechanism itself
# is real code and needs coverage independent of whether it happens to
# be the shipped default.


def test_light_traffic_mode_suppresses_scored_switching():
    engine = DecisionEngine(
        initial_phase="NS_straight_left",
        config=DecisionConfig(
            light_traffic_congestion_threshold=0.5,  # generous, easy to stay under
            switch_hysteresis_margin=0.08,
        ),
    )
    engine.decide(make_features({}), None, dt_seconds=20.0)  # clear min green (and the 20 s preemption floor)

    # A gap large enough it would clearly trigger an ordinary switch
    # outside light-traffic mode (see test_hysteresis_switches_when_clearly_better).
    features = make_features({
        "S_in_1": (1, 0.0), "N_in_1": (1, 0.0),
        "E_in_1": (20, 60.0), "W_in_1": (20, 60.0),
    })
    decision = engine.decide(features, None, dt_seconds=5.0)

    assert decision.switched is False
    assert decision.decision_mode == "light_traffic_patience"
    assert decision.active_phase == "NS_straight_left"


def test_light_traffic_mode_still_allows_gap_out():
    engine = DecisionEngine(
        initial_phase="NS_straight_left",
        config=DecisionConfig(light_traffic_congestion_threshold=0.5),
    )
    engine.decide(
        make_features({"S_in_1": (5, 0.0), "N_in_1": (5, 0.0)}), None, dt_seconds=15.0,
    )
    features = make_features({"E_in_1": (5, 0.0), "W_in_1": (5, 0.0)})  # NS now empty

    decision = engine.decide(features, None, dt_seconds=1.0)

    assert decision.switched is True
    assert decision.decision_mode == "gap_out"


def test_above_threshold_scored_switching_resumes():
    engine = DecisionEngine(
        initial_phase="NS_straight_left",
        config=DecisionConfig(
            light_traffic_congestion_threshold=0.01,  # easy to exceed
            switch_hysteresis_margin=0.08,
        ),
    )
    engine.decide(make_features({}), None, dt_seconds=15.0)

    features = make_features({
        "S_in_1": (1, 0.0), "N_in_1": (1, 0.0),
        "E_in_1": (20, 60.0), "W_in_1": (20, 60.0),
    })
    decision = engine.decide(features, None, dt_seconds=5.0)

    assert decision.switched is True
    assert decision.decision_mode == "priority"


# ===================== Gap-out =====================


def test_gap_out_releases_an_empty_phase_immediately():
    engine = DecisionEngine(initial_phase="NS_straight_left")
    # Give NS_straight_left demand just long enough to clear min green,
    # then let it go completely empty while EW_straight_left has
    # traffic - a single tick should be enough to gap out, no
    # confirmation window required (gap-out bypasses the debounce).
    engine.decide(
        make_features({"S_in_1": (5, 0.0), "N_in_1": (5, 0.0)}), None, dt_seconds=15.0,
    )
    features = make_features({"E_in_1": (5, 0.0), "W_in_1": (5, 0.0)})  # NS now empty

    decision = engine.decide(features, None, dt_seconds=1.0)

    assert decision.switched is True
    assert decision.decision_mode == "gap_out"
    assert decision.active_phase == "EW_straight_left"


def test_gap_out_does_not_fire_with_residual_demand():
    engine = DecisionEngine(initial_phase="NS_straight_left")
    engine.decide(
        make_features({"S_in_1": (5, 0.0), "N_in_1": (5, 0.0)}), None, dt_seconds=15.0,
    )
    # NS_straight_left still has 1 vehicle - not empty - even though
    # EW_straight_left has much more demand; this must go through the
    # ordinary (debounced) hysteresis path, not gap-out.
    features = make_features({
        "S_in_1": (1, 0.0), "E_in_1": (5, 0.0), "W_in_1": (5, 0.0),
    })

    decision = engine.decide(features, None, dt_seconds=1.0)

    assert decision.decision_mode != "gap_out"
    assert decision.switched is False  # confirmation window not yet elapsed


def test_gap_out_does_not_fire_when_the_whole_junction_is_empty():
    engine = DecisionEngine(initial_phase="NS_straight_left")
    engine.decide(make_features({}), None, dt_seconds=20.0)  # clear min green (and the 20 s preemption floor), empty

    decision = engine.decide(make_features({}), None, dt_seconds=1.0)  # still empty everywhere

    assert decision.switched is False
    assert decision.decision_mode != "gap_out"


# ===================== Switch-confirmation debounce =====================


def test_a_reverting_blip_never_triggers_a_switch():
    """
    The exact scenario the debounce exists for: a competing phase
    edges ahead for one tick (e.g. 2-3 vehicles arriving briefly) and
    then drops back before the confirmation window elapses - the
    signal must never have flipped for that blip.
    """
    engine = _hysteresis_engine()
    engine.decide(make_features({}), None, dt_seconds=20.0)  # clear min green (and the 20 s preemption floor)

    blip = make_features({
        "S_in_1": (5, 0.0), "N_in_1": (5, 0.0),
        "E_in_1": (6, 0.0), "W_in_1": (6, 0.0),
    })
    settled = make_features({
        "S_in_1": (5, 0.0), "N_in_1": (5, 0.0),
        "E_in_1": (5, 0.0), "W_in_1": (5, 0.0),
    })

    d1 = engine.decide(blip, None, dt_seconds=1.0)
    d2 = engine.decide(settled, None, dt_seconds=1.0)
    d3 = engine.decide(settled, None, dt_seconds=1.0)

    assert d1.switched is False
    assert d2.switched is False
    assert d3.switched is False
    assert engine.current_phase == "NS_straight_left"


# ===================== Hard starvation guarantee =====================


def _starvation_engine(**config_overrides) -> DecisionEngine:
    # starvation_rate_per_second=0.0 proves the HARD limit itself (a
    # guarantee independent of score math) forces the switch, not the
    # separately-adaptive soft starvation pressure the engine also has.
    # max_green_seconds is also pushed far out so the (separately
    # tested) max-green ceiling can't fire first and get confused for
    # this mechanism - both use decision_mode "priority" while hard
    # starvation uses its own "starvation_override".
    far_max_green = {
        "NS_straight_left": 1000.0, "NS_right": 1000.0,
        "EW_straight_left": 1000.0, "EW_right": 1000.0,
    }
    return DecisionEngine(
        initial_phase="NS_straight_left",
        config=DecisionConfig(
            starvation_rate_per_second=0.0, max_green_seconds=far_max_green, **config_overrides
        ),
    )


def test_hard_starvation_forces_a_switch_eventually():
    # One vehicle on E_in_1 that can never win on score against two
    # 15-vehicle lanes - only the hard starvation guarantee can serve it.
    engine = _starvation_engine()
    features = make_features({"S_in_1": (15, 30.0), "N_in_1": (15, 30.0), "E_in_1": (1, 5.0)})

    decision = None
    for _ in range(7):  # 7 * 25s = 175s, comfortably past the 150s hard limit
        decision = engine.decide(features, None, dt_seconds=25.0)
        if decision.switched:
            break

    assert decision is not None
    assert decision.switched is True
    assert decision.decision_mode == "starvation_override"
    assert decision.active_phase != "NS_straight_left"


def test_hard_starvation_with_demand_gate_serves_the_phase_with_traffic():
    engine = _starvation_engine(starvation_requires_demand=True)
    features = make_features({"S_in_1": (15, 30.0), "N_in_1": (15, 30.0), "E_in_1": (1, 5.0)})
    decision = None
    for _ in range(7):
        decision = engine.decide(features, None, dt_seconds=25.0)
        if decision.switched:
            break
    assert decision is not None and decision.switched is True
    assert decision.decision_mode == "starvation_override"
    assert decision.active_phase == "EW_straight_left"


def test_hard_starvation_never_force_serves_an_empty_phase():
    # With DecisionConfig.starvation_requires_demand on, starvation means
    # unserved DEMAND: with nobody on any other phase there is nothing to
    # starve, so the engine keeps serving the phase that has traffic.
    # (Off by default - tested and found to lose to VAC in light traffic,
    # see Section 26.4 - but the mechanism must still work when asked.)
    engine = _starvation_engine(starvation_requires_demand=True)
    features = make_features({"S_in_1": (15, 30.0), "N_in_1": (15, 30.0)})

    for _ in range(8):  # 200s, well past the 150s hard limit
        decision = engine.decide(features, None, dt_seconds=25.0)
        assert decision.decision_mode != "starvation_override"
        assert decision.active_phase == "NS_straight_left"


def test_starvation_pressure_does_not_lift_an_empty_phase():
    engine = _starvation_engine(starvation_requires_demand=True)
    # 60s of idling lets every other phase accumulate the full 0.20 cap
    # of soft pressure - but with nobody on them it must not be applied.
    features = make_features({"S_in_1": (15, 30.0), "N_in_1": (15, 30.0)})
    decision = engine.decide(features, None, dt_seconds=60.0)
    for name, score in decision.phase_scores.items():
        if name != "NS_straight_left":
            assert score == 0.0


def test_gap_out_releases_to_present_demand_not_forecast():
    # Current phase empty; W_in_1 has one vehicle actually waiting;
    # N/S have nobody but the model forecasts a large arrival there.
    # The gap-out must go to the phase somebody is waiting on.
    engine = DecisionEngine(config=DecisionConfig(), initial_phase="EW_right")
    engine.decide(make_features({"E_in_2": (3, 5.0)}), None, dt_seconds=15.0)  # past min green
    features = make_features({"W_in_1": (1, 12.0)})
    prediction = make_prediction({"N_in_1": (18, 50.0, 100.0), "S_in_1": (18, 50.0, 100.0)})
    decision = engine.decide(features, prediction, dt_seconds=1.0)
    assert decision.switched is True
    assert decision.decision_mode == "gap_out"
    assert decision.active_phase == "EW_straight_left"


def test_no_starvation_override_before_the_hard_limit():
    engine = _starvation_engine()
    features = make_features({"S_in_1": (15, 30.0), "N_in_1": (15, 30.0)})

    decision = engine.decide(features, None, dt_seconds=25.0)  # only 25s elapsed

    assert decision.switched is False
    assert decision.decision_mode != "starvation_override"


# ===================== Emergency override =====================


def test_emergency_does_not_preempt_before_safety_minimum():
    engine = DecisionEngine(initial_phase="NS_straight_left")
    decision = engine.decide(
        make_features({}), None, dt_seconds=1.0, emergency_lanes=frozenset({"E_in_1"}),
    )

    assert decision.switched is False
    assert decision.decision_mode == "min_green_hold"


def test_emergency_overrides_after_safety_minimum():
    engine = DecisionEngine(initial_phase="NS_straight_left")
    features = make_features({})
    engine.decide(features, None, dt_seconds=6.0)  # past the 5s safety minimum

    decision = engine.decide(
        features, None, dt_seconds=1.0, emergency_lanes=frozenset({"E_in_1"}),
    )

    assert decision.switched is True
    assert decision.decision_mode == "emergency"
    assert decision.active_phase == "EW_straight_left"


def test_emergency_holds_current_phase_when_already_serving_it():
    engine = DecisionEngine(initial_phase="NS_straight_left")
    decision = engine.decide(
        make_features({}), None, dt_seconds=1.0, emergency_lanes=frozenset({"N_in_1"}),
    )

    assert decision.switched is False
    assert decision.decision_mode == "emergency"
    assert decision.active_phase == "NS_straight_left"


# ===================== Confidence-weighted prediction blending =====================


def test_prediction_blend_weight_scales_with_confidence():
    engine = DecisionEngine()
    features = make_features({"N_in_1": (0, 0.0)})  # zero current demand

    zero_confidence = make_prediction({"N_in_1": (20.0, 60.0, 0.0)})
    full_confidence = make_prediction({"N_in_1": (20.0, 60.0, 100.0)})

    score_no_conf = engine._lane_score("N_in_1", features, zero_confidence)
    score_full_conf = engine._lane_score("N_in_1", features, full_confidence)

    # Zero confidence must fall back to pure current-state (0 demand
    # here -> 0.0). Full confidence pulls the score up towards the
    # prediction, but MAX_PREDICTED_WEIGHT caps how far - prediction
    # never fully replaces current state even at perfect confidence.
    assert score_no_conf == pytest.approx(0.0)
    assert score_full_conf == pytest.approx(engine.config.max_predicted_weight)


# ===================== DecisionConfig is genuinely tunable =====================


def test_custom_config_changes_behaviour():
    fast_emergency = DecisionConfig(emergency_minimum_safety_seconds=0.0)
    engine = DecisionEngine(initial_phase="NS_straight_left", config=fast_emergency)

    # Zero elapsed time in the current phase; only the custom config's
    # zero safety minimum allows an immediate emergency override -
    # proving the constructor's config argument is actually wired into
    # decide(), not merely stored and ignored.
    decision = engine.decide(
        make_features({}), None, dt_seconds=0.0, emergency_lanes=frozenset({"E_in_1"}),
    )

    assert decision.switched is True
    assert decision.decision_mode == "emergency"


def test_missing_calibration_file_falls_back_to_defaults():
    engine = DecisionEngine(calibration_path="/does/not/exist.json")
    assert engine.config == DecisionConfig()


def test_scored_preemption_waits_for_the_realistic_green_floor():
    # A phase still serving traffic keeps its green for
    # min_green_before_preemption_seconds (20 s on a main phase) before a
    # score may take it away - even a decisive lead sustained past the
    # 3 s confirmation window. Gap-out is NOT held back by this floor
    # (covered by test_gap_out_releases_to_present_demand_not_forecast).
    engine = _hysteresis_engine()
    engine.decide(make_features({}), None, dt_seconds=10.0)  # past min green, inside the floor
    # NS is still serving substantial demand by the engine's own measure
    # (6 vehicles, 8 s waits -> phase score ~0.25 >=
    # preemption_floor_min_phase_score), which is what makes the floor
    # bind; a phase with little left to serve is not held (next test).
    features = make_features({
        "S_in_1": (6, 8.0), "N_in_1": (6, 8.0),
        "E_in_1": (20, 60.0), "W_in_1": (20, 60.0),
    })
    for _ in range(9):  # t = 11..19 s: clear lead, still no switch
        decision = engine.decide(features, None, dt_seconds=1.0)
        assert decision.switched is False
    # Past the floor the normal confirmation window applies from here.
    for _ in range(3):
        decision = engine.decide(features, None, dt_seconds=1.0)
    assert decision.switched is True
    assert decision.active_phase == "EW_straight_left"


def test_preemption_floor_does_not_hold_a_phase_with_little_left_to_serve():
    # NS scores ~0.03 (one car per lane, nobody waiting) - below
    # preemption_floor_min_phase_score - so the floor is moot and a
    # clearly better rival takes the phase as soon as min green + the
    # confirmation window allow. This is the light-traffic shape that
    # made the gate a phase score rather than a vehicle count or a
    # discharge rate (Section 26.4b).
    engine = _hysteresis_engine()
    engine.decide(make_features({}), None, dt_seconds=10.0)
    features = make_features({
        "S_in_1": (1, 0.0), "N_in_1": (1, 0.0),
        "E_in_1": (20, 60.0), "W_in_1": (20, 60.0),
    })
    decision = None
    for _ in range(3):
        decision = engine.decide(features, None, dt_seconds=1.0)
    assert decision.switched is True
    assert decision.active_phase == "EW_straight_left"
