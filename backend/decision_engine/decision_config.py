"""
decision_config.py
===================
Every tunable constant DecisionEngine reads, collected into one
dataclass instead of module-level globals in decision_engine.py. This
does not change behaviour by itself - DecisionConfig() with no
arguments reproduces the exact values the engine used before this file
existed - it only makes those values reachable without editing source
(construct a DecisionConfig with overrides, or load one from the
calibration file written by calibrate_normalization.py) and gives
tests something concrete to construct and assert against.

PHASE_NAMES and the lane/phase topology tables stay in
decision_engine.py: they describe the frozen network's structure, not
a tunable, and DecisionConfig's per-phase dicts (MIN_GREEN_SECONDS,
MAX_GREEN_SECONDS) are keyed against that same PHASE_NAMES tuple.
"""

from dataclasses import dataclass, field
from typing import Dict


def _default_min_green() -> Dict[str, float]:
    # The floor below which NOTHING ends a phase (gap-out included).
    # NOTE the phase timer starts at the switch DECISION, so the 3 s
    # amber clearance counts toward this: 10 means ~7 s of actual
    # green. Shared with the VAC baseline (performance.
    # baseline_controllers imports MIN_GREEN_SECONDS from
    # decision_engine), so both controllers get the same floor and the
    # comparison stays fair. Kept short on purpose: a phase whose own
    # lanes have emptied SHOULD be released quickly - that is what
    # actuated control means. The realistic-green guarantee lives in
    # min_green_before_preemption_seconds instead (see below).
    return {
        "NS_straight_left": 10.0, "EW_straight_left": 10.0,
        "NS_right": 8.0, "EW_right": 8.0,
    }


def _default_min_green_before_preemption() -> Dict[str, float]:
    # Added 2026-09-13 (Section 26.4b). A phase that is STILL SERVING
    # traffic may not be taken away by the scored-preference switch
    # before this many seconds (amber included, as above - 20 means
    # ~17 s of actual green). Gap-out, max-green, hard starvation and
    # emergency are unaffected: they end a phase for a physical reason,
    # this only restrains the one path that ends it on a score. Before
    # this, a heavy approach's green was being preempted after 12-17 s
    # whenever a waiting phase out-scored it - the "green for ten
    # seconds, then amber" behaviour the user rejected as unrealistic.
    # A restriction the AI places on itself: VAC never preempts, so the
    # comparison stays fair.
    return {
        "NS_straight_left": 20.0, "EW_straight_left": 20.0,
        "NS_right": 12.0, "EW_right": 12.0,
    }


def _default_max_green() -> Dict[str, float]:
    return {
        "NS_straight_left": 45.0, "EW_straight_left": 45.0,
        "NS_right": 20.0, "EW_right": 20.0,
    }


@dataclass(frozen=True)
class DecisionConfig:
    """
    Immutable bundle of DecisionEngine tunables. Defaults reproduce the
    engine's original hardcoded behaviour exactly.
    """

    # Per-phase green clamps (seconds). Keyed by phase name, see
    # decision_engine.PHASE_NAMES.
    min_green_seconds: Dict[str, float] = field(default_factory=_default_min_green)
    max_green_seconds: Dict[str, float] = field(default_factory=_default_max_green)
    min_green_before_preemption_seconds: Dict[str, float] = field(
        default_factory=_default_min_green_before_preemption
    )
    # The preemption floor above only binds while the current phase is
    # still serving SUBSTANTIAL demand by the engine's own measure: its
    # phase score (the same 0-1 urgency every other decision uses) must
    # be at least this. Why a score and not a count or a flow rate
    # (Section 26.4b, all measured on light_seed1 by logging every tick
    # the floor bound): vehicles PRESENT could not tell "four cars just
    # inserted 150 m up the approach" from a heavy stream; vehicles
    # STANDING never bound at all in heavy traffic (the standing queue is
    # gone by the time the stream gets cut); the DEPARTURE RATE is
    # backward-looking and kept holding phases that had just FINISHED
    # discharging (one car left, seven recently gone) while a rival had a
    # car actually waiting. In every one of those light-traffic moments
    # the current phase scored 0.03-0.10 against a rival at 0.20-0.53 -
    # the engine already knew there was nothing left worth protecting.
    # A heavy approach mid-stream scores 0.3 and up. 0.0 = always binds.
    preemption_floor_min_phase_score: float = 0.12

    # NO LONGER USED (2026-09-13). Left turns used to run in both main
    # phases, so their demand was shared and had to be folded into each
    # main phase's score at partial weight. They are protected now - each
    # left runs only in its own approach's phase - so that demand is
    # counted directly by the phase that serves it and this multiplier
    # would double-count it. Kept as a field so existing constructions of
    # DecisionConfig (tests, calibration scripts, saved experiments) keep
    # working rather than raising TypeError; setting it has no effect.
    # See decision_engine.py's LEFT TURNS ARE PROTECTED note.
    left_turn_influence: float = 0.3

    # Normalization ceilings turning a raw vehicle_count / waiting_time
    # into a 0-1 urgency term. See calibrate_normalization.py for how
    # these can be derived from recorded lane_state_log data instead of
    # left at these starting-point defaults.
    norm_vehicle_count: float = 20.0
    norm_waiting_time_seconds: float = 60.0

    # Lane urgency's waiting-time contribution (default total weight 0.4,
    # see _lane_score) is split between the lane's MEAN waiting time and
    # its single LONGEST-waiting vehicle. The mean can look fine while
    # one unlucky vehicle has been sitting far longer than everyone
    # else - exactly the scenario that produces a bad worst-case travel
    # time, a metric the mean-only formula had no direct visibility
    # into. LaneFeatures.max_waiting_time was already computed by
    # FeatureEngineer for this purpose but unused here until now.
    # average_waiting_time_influence + max_waiting_time_influence should
    # sum to the same 0.4 the original single mean-only term used, so
    # this is a split of existing weight, not new total influence.
    average_waiting_time_influence: float = 0.25
    max_waiting_time_influence: float = 0.15

    # A candidate phase must beat the current phase's score by more
    # than this margin to trigger a switch before max green. Raised
    # from an original 0.08 through three rounds of empirical A/B
    # testing against VAC (Sections 20-22): 0.25 was best before the
    # starvation-timer bug fix; 0.30 after that fix; 0.35 after adding
    # max_waiting_time_influence to lane scoring (Section 22), which
    # makes the engine more reactive to a single long-waiting vehicle
    # and needed more patience elsewhere to compensate. At 0.35, all 13
    # scenarios in the library are a clean 7/7 sweep against VAC
    # (verified, not asserted - see Section 22.2). Re-verify against
    # real evaluator runs across the full scenario library before
    # changing this again, the same way every prior value was found -
    # each mechanism change has shifted the optimum, sometimes sharply.
    switch_hysteresis_margin: float = 0.35

    # Scales the hysteresis margin up as the whole junction saturates
    # (congestion_index in [0, 1]), so a switch requires a clearly
    # better alternative under oversaturation instead of a marginal one.
    oversaturation_margin_bonus: float = 0.25

    # Below this congestion_index, the engine enters LIGHT-TRAFFIC MODE:
    # the scored/predictive preemption switch (the ordinary hysteresis
    # branch below) is disabled entirely - only gap-out, max-green, hard
    # starvation, and emergency can change the phase.
    #
    # Defaults to 0.0 (never active) DELIBERATELY, not because the idea
    # is wrong - it is the same underlying insight that motivated
    # raising switch_hysteresis_margin above - but because empirical A/B
    # testing (light_seed1 vs VAC, Section 20) found every nonzero
    # threshold tried (0.03, 0.06, 0.12, 0.20), combined with the tuned
    # 0.25 margin, performed slightly WORSE than the margin alone: a
    # hard on/off gate loses information a continuous margin keeps (how
    # much a candidate leads by, not just whether congestion crossed a
    # line). The mechanism is kept, tested, and available - a future
    # network/scenario/dataset could plausibly find a threshold that
    # helps even though this one measured slightly negative - but it is
    # not the shipped default. Set to a small positive value only after
    # re-verifying it against real evaluator runs, the same way this
    # value was chosen.
    light_traffic_congestion_threshold: float = 0.0

    # An ordinary (non-gap-out, non-emergency, non-hard-starvation)
    # switch must have the SAME candidate phase leading by the
    # hysteresis margin for this many consecutive seconds before it is
    # actually committed - a real-world debounce so a transient 2-3
    # vehicle blip that reverses itself next tick can never flip the
    # signal. Gap-out (a phase going genuinely empty) and the hard
    # starvation guarantee both bypass this deliberately - those are
    # unambiguous, not noisy, signals.
    switch_confirmation_seconds: float = 3.0

    # Soft starvation pressure per second a phase goes unserved.
    starvation_rate_per_second: float = 0.01

    # Ceiling on the soft starvation term (starvation_rate_per_second *
    # seconds unserved), kept deliberately BELOW switch_hysteresis_margin
    # so soft pressure alone can never single-handedly clear the margin
    # and force a scored switch - it can only ever tip a genuine
    # near-tie. At the default rate, an UNCAPPED term reaches the 0.25
    # margin after just 25s unserved, well before hard_starvation_
    # limit_seconds (150s) - i.e. without this cap, "soft" starvation
    # was already causing clock-driven switches unrelated to real
    # demand, well ahead of the explicit hard-starvation guarantee
    # (Section 20's balanced_seed1 root-cause analysis, mechanism A3).
    # The hard guarantee itself (_most_starved_phase_over_hard_limit) is
    # a separate, unconditional check and is NOT affected by this cap.
    #
    # Tested at 0.10 on 2026-09-13 (Section 26.4b) because in a four-phase
    # rotation every rival has always been unserved >= 20 s, so every
    # rival permanently carries +0.20 and the 0.35 margin is really
    # 0.15 - that cut heavy-approach greens to 12-17 s. 0.10 fixed heavy
    # but lost light traffic (where that same pressure is what lets a
    # car waiting 30 s preempt a phase serving one moving car). Kept at
    # 0.20; the heavy-traffic impatience is handled where it belongs,
    # by min_green_before_preemption_seconds.
    starvation_pressure_cap: float = 0.20

    # Hard starvation ceiling: force-serve regardless of score once a
    # phase has gone this long unserved.
    hard_starvation_limit_seconds: float = 150.0

    # Minimum green the CURRENT phase gets before an emergency override
    # may cut it short.
    emergency_minimum_safety_seconds: float = 5.0
    # Minimum time an emergency phase is held once switched to.
    emergency_service_window_seconds: float = 15.0

    # Ceiling on how much of the predicted component's weight is used,
    # reached only at 100% prediction confidence.
    max_predicted_weight: float = 0.35

    # When the current phase gaps out (its own lanes are empty), choose
    # the NEXT phase by present demand only - lane scores computed with
    # no prediction blended in - rather than by the blended scores the
    # scored-preemption path uses. Added 2026-09-13 (Section 26.4 of the
    # architecture report). Gap-out is a "who is actually waiting right
    # now" question, and VAC - which the gap-out was written to mirror -
    # answers it with raw counts. With the prediction blended in, a
    # phase with nobody at the line but a forecast arrival could outrank
    # a phase with a vehicle already stopped, and in light traffic that
    # is exactly the vehicle whose wait then grows. Measured on
    # light_seed1 with the retrained model: prediction on, blended
    # choice 3/7 vs VAC; the same run choosing by present demand 6/7 -
    # with the SAME 64 switches either way, so this changes which phase
    # is served, never how often the signal changes. The predicted
    # component still shapes every hold-or-preempt decision; it only no
    # longer speaks for lanes with nobody on them at the moment of a
    # gap-out. Kept as a flag so the A/B stays reproducible.
    gap_out_uses_present_demand: bool = True

    # Starvation - both the soft pressure term in the phase score and
    # the hard override at hard_starvation_limit_seconds - only counts
    # for a phase that has at least one vehicle on its lanes. Added
    # 2026-09-13 (Section 26.4). "Starved" means unserved DEMAND; a phase
    # nobody is waiting for cannot be starved, and serving it anyway
    # costs a minimum green spent on an empty road plus an extra switch
    # the anti-flicker work exists to avoid. Before this, a right-turn
    # phase that saw no traffic for 150 s in light demand was force-
    # served regardless, and a phase 20 s unserved with zero vehicles
    # (pressure 0.20) outranked a phase with one vehicle actually
    # waiting 10 s (score ~0.10) at gap-out. The unserved timer itself
    # keeps running while a phase is empty, so a vehicle arriving on a
    # long-unserved phase is still served promptly - the credit is kept,
    # it is just not spent on nobody.
    starvation_requires_demand: bool = False

    @classmethod
    def from_calibration_dict(cls, data: dict) -> "DecisionConfig":
        """
        Build a DecisionConfig from calibrate_normalization.py's output,
        overriding only the normalization ceilings and leaving every
        other tunable at its default. Unknown/missing keys are ignored
        rather than raising, so a partial or hand-edited calibration
        file degrades to defaults instead of crashing startup.
        """
        return cls(
            norm_vehicle_count=float(
                data.get("norm_vehicle_count", cls.norm_vehicle_count)
            ),
            norm_waiting_time_seconds=float(
                data.get("norm_waiting_time_seconds", cls.norm_waiting_time_seconds)
            ),
        )
