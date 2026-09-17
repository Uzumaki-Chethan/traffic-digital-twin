"""
decision_engine.py
====================
Reads Current State (TrafficFeatures) + Prediction State (TrafficPrediction)
and writes only Desired State (a Decision) - never touches Actual State,
never calls TraCI, matching the architecture's Section 6.2 discipline.
Stateful: owns current_phase, seconds_in_current_phase, and per-phase
starvation timers as instance state, the same way TraCIManager/DigitalTwin
own their own runtime state. Call decide() once per tick with fresh
TrafficFeatures + TrafficPrediction.

PHASE STRUCTURE (verified directly against sumo/network/intersection.tll.xml,
not assumed):
  NS_straight_left (base 30s green + 3s yellow): serves S_in_0, S_in_1,
    N_in_0, N_in_1 - both the straight lanes and the two NORTH/SOUTH
    left turns, all exclusively.
  NS_right (base 12s + 3s yellow): serves S_in_2, N_in_2 exclusively.
  EW_straight_left (base 30s + 3s yellow): serves E_in_0, E_in_1,
    W_in_0, W_in_1 exclusively.
  EW_right (base 12s + 3s yellow): serves E_in_2, W_in_2 exclusively.

LEFT TURNS ARE PROTECTED (changed 2026-09-13). They used to run in BOTH
main phases, which the network's conflict matrix permits - every left
turn genuinely has an empty foe list. That permission depends entirely
on perfect lane discipline, though: each movement is channelized into
its own dedicated outbound lane, so a left turn and a through movement
feeding the same edge never touch ONLY as long as both hold lane
exactly. Real traffic of the kind this project models does not, so each
left now runs in its own approach's phase alone. See the LEFT-TURN
POLICY note in intersection.tll.xml for the full reasoning.

The practical consequence here is that every one of the twelve lanes now
belongs to exactly one phase. There is no shared lane left to
special-case, which is why the left-turn scoring bonus that used to live
in _phase_scores() is gone rather than retuned - a left lane's demand is
now counted by its own phase's exclusive urgency, and counting it twice
would double-weight it.

Yellow/all-red clearance (3s, from the frozen .tll.xml) is NOT decided
here - this engine only ever outputs a green duration; the Signal
Controller is responsible for inserting the fixed clearance interval
between any two phases, exactly as SUMO's own protected-phase design
already requires.

TUNABLES vs TOPOLOGY
---------------------
Everything about the frozen network's structure (PHASE_NAMES, which
lanes each phase serves, which lanes are left turns) lives here as
module-level constants, because it describes THIS network and does not
change between runs. Everything that is a genuine dial - green clamps,
hysteresis margins, starvation limits, emergency windows, normalization
ceilings - lives in DecisionConfig (decision_config.py) instead, passed
into the constructor. This split is what lets calibrate_normalization.py
and tests/test_decision_engine.py construct a DecisionEngine with
different tunables without touching this file.
"""

import json
import logging
import os
from dataclasses import dataclass
from typing import Dict, FrozenSet, Mapping, Optional, Tuple

from models import TrafficFeatures, TrafficPrediction
from decision_engine.decision_config import DecisionConfig

logger = logging.getLogger(__name__)

# ===================== Verified phase/lane structure =====================

PHASE_NAMES: Tuple[str, ...] = (
    "NS_straight_left", "NS_right", "EW_straight_left", "EW_right",
)

# Every lane belongs to exactly one phase now that left turns are
# protected - see the LEFT TURNS ARE PROTECTED note above. Keep this in
# step with intersection.tll.xml; it is the same structure expressed
# twice, once for SUMO and once for the engine that drives it.
_PHASE_EXCLUSIVE_LANES: Dict[str, Tuple[str, ...]] = {
    "NS_straight_left": ("S_in_0", "S_in_1", "N_in_0", "N_in_1"),
    "NS_right": ("S_in_2", "N_in_2"),
    "EW_straight_left": ("E_in_0", "E_in_1", "W_in_0", "W_in_1"),
    "EW_right": ("E_in_2", "W_in_2"),
}

_MAIN_PHASES: FrozenSet[str] = frozenset({"NS_straight_left", "EW_straight_left"})

ALL_APPROACH_LANES: Tuple[str, ...] = (
    "N_in_0", "N_in_1", "N_in_2", "S_in_0", "S_in_1", "S_in_2",
    "E_in_0", "E_in_1", "E_in_2", "W_in_0", "W_in_1", "W_in_2",
)

# Re-exported from DecisionConfig's own defaults (not from a calibrated
# instance - these are physical safety clamps, not something
# calibrate_normalization.py ever touches) so that
# performance/baseline_controllers.py's fixed-timer and VAC baselines -
# which must use the IDENTICAL min/max green as the AI for the
# comparison to be fair - can keep importing them from here rather than
# from decision_config directly.
MIN_GREEN_SECONDS: Dict[str, float] = DecisionConfig().min_green_seconds
MAX_GREEN_SECONDS: Dict[str, float] = DecisionConfig().max_green_seconds

# Where calibrate_normalization.py writes its output and where
# DecisionEngine looks for it by default. A missing file is not an
# error - it just means "use DecisionConfig()'s built-in defaults",
# exactly the pre-calibration behaviour.
DEFAULT_CALIBRATION_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "normalization_calibration.json"
)


def _load_default_config(calibration_path: str) -> DecisionConfig:
    """
    Best-effort calibration load: any missing file, unreadable JSON, or
    malformed content silently falls back to DecisionConfig()'s
    hardcoded defaults - a bad calibration file must never prevent the
    engine from starting.
    """
    if not os.path.isfile(calibration_path):
        return DecisionConfig()
    try:
        with open(calibration_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        config = DecisionConfig.from_calibration_dict(data)
        logger.info(
            "Loaded calibrated normalization ceilings from %s "
            "(norm_vehicle_count=%.2f, norm_waiting_time_seconds=%.2f).",
            calibration_path, config.norm_vehicle_count,
            config.norm_waiting_time_seconds,
        )
        return config
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        logger.warning(
            "Could not load calibration file %s (%s); using default "
            "normalization ceilings.", calibration_path, exc,
        )
        return DecisionConfig()


@dataclass(frozen=True)
class Decision:
    """
    Desired State output - written by DecisionEngine, read by the
    Signal Controller. Never mutated after creation.
    """
    active_phase: str
    green_duration_seconds: float
    switched: bool
    decision_mode: str  # "priority" | "gap_out" | "light_traffic_patience" | "emergency" | "starvation_override" | "min_green_hold"
    reason_text: str
    phase_scores: Mapping[str, float]
    # Per-lane urgency scores (same 0-1 scale _lane_score produces),
    # exposed so callers (app.py) can persist per-lane congestion
    # without recomputing it - see backend/analytics/congestion_analytics.py.
    lane_scores: Mapping[str, float]
    # The effective hysteresis margin at this tick: how far above the
    # served phase's score a challenger must lead before an ordinary
    # preference switch is even considered (switch_hysteresis_margin +
    # oversaturation_margin_bonus x congestion_index). Exposed so the
    # dashboard can draw the decision boundary, not just the scores.
    # 0.0 for controllers that have no such margin (the baselines).
    switch_margin: float = 0.0


class DecisionEngine:
    """
    Stateful phase-selection engine. One instance per intersection.
    """

    def __init__(
        self,
        initial_phase: str = "NS_straight_left",
        config: Optional[DecisionConfig] = None,
        calibration_path: str = DEFAULT_CALIBRATION_PATH,
    ):
        if initial_phase not in PHASE_NAMES:
            raise ValueError(
                "initial_phase must be one of {}, got {!r}".format(PHASE_NAMES, initial_phase)
            )
        self._config = config if config is not None else _load_default_config(calibration_path)
        self._current_phase = initial_phase
        self._seconds_in_current_phase = 0.0
        self._last_margin = self._config.switch_hysteresis_margin
        self._seconds_since_last_served: Dict[str, float] = {name: 0.0 for name in PHASE_NAMES}
        self._emergency_hold_remaining = 0.0
        # Switch-confirmation debounce state (see decide()'s ordinary
        # hysteresis branch): which phase has been the leading candidate
        # for how many consecutive seconds. Reset to (None, 0.0) any
        # tick the leading condition breaks, and by every actual switch.
        self._candidate_phase: Optional[str] = None
        self._candidate_seconds: float = 0.0

    @property
    def current_phase(self) -> str:
        return self._current_phase

    @property
    def config(self) -> DecisionConfig:
        return self._config

    def decide(
        self,
        features: TrafficFeatures,
        prediction: Optional[TrafficPrediction],
        dt_seconds: float = 1.0,
        emergency_lanes: FrozenSet[str] = frozenset(),
    ) -> Decision:
        """
        One decision tick. Advances internal phase-timing state by
        dt_seconds, then decides whether to hold, extend, or switch.

        Parameters
        ----------
        features : TrafficFeatures
            Current engineered state, from FeatureEngineer.
        prediction : TrafficPrediction | None
            15s-ahead prediction, from MLPredictor. None is a valid
            input (e.g. no trained model available yet) and is handled
            identically to every lane having 0 confidence - pure
            current-state fallback, no special-cased branch needed.
        dt_seconds : float
            Elapsed simulated time since the last decide() call.
        emergency_lanes : FrozenSet[str]
            Lane IDs with a known approaching/present emergency vehicle.
            Empty by default. See module docstring for why this is a
            caller-supplied parameter rather than read from `features`
            directly - the current schema has no vehicle-class field to
            derive it from yet.
        """
        cfg = self._config
        self._seconds_in_current_phase += dt_seconds
        for name in PHASE_NAMES:
            if name != self._current_phase:
                self._seconds_since_last_served[name] += dt_seconds
        if self._emergency_hold_remaining > 0.0:
            self._emergency_hold_remaining = max(0.0, self._emergency_hold_remaining - dt_seconds)

        lane_scores = {
            lane_id: self._lane_score(lane_id, features, prediction)
            for lane_id in ALL_APPROACH_LANES
        }
        phase_scores = self._phase_scores(lane_scores, features)
        congestion_index = sum(lane_scores.values()) / len(lane_scores)
        self._last_margin = (
            cfg.switch_hysteresis_margin
            + cfg.oversaturation_margin_bonus * congestion_index
        )

        emergency_phase = self._select_emergency_phase(emergency_lanes)
        if emergency_phase is not None and emergency_phase != self._current_phase:
            if self._seconds_in_current_phase >= cfg.emergency_minimum_safety_seconds:
                return self._switch_to(
                    emergency_phase, phase_scores, lane_scores, "emergency",
                    "Emergency vehicle detected on a lane served by {}; overriding after "
                    "{:.1f}s minimum safety green on {}.".format(
                        emergency_phase, self._seconds_in_current_phase, self._current_phase
                    ),
                    hold_seconds=cfg.emergency_service_window_seconds,
                )
        if emergency_phase is not None and emergency_phase == self._current_phase:
            self._emergency_hold_remaining = max(
                self._emergency_hold_remaining, cfg.emergency_service_window_seconds
            )

        if self._emergency_hold_remaining > 0.0:
            return self._hold(
                phase_scores, lane_scores, "emergency",
                "Holding {} for emergency service window ({:.1f}s remaining).".format(
                    self._current_phase, self._emergency_hold_remaining
                ),
            )

        starved_phase = self._most_starved_phase_over_hard_limit(features)
        if starved_phase is not None and starved_phase != self._current_phase:
            if self._seconds_in_current_phase >= cfg.min_green_seconds[self._current_phase]:
                return self._switch_to(
                    starved_phase, phase_scores, lane_scores, "starvation_override",
                    "{} unserved for {:.1f}s (hard limit {:.0f}s) - force-serving regardless "
                    "of score.".format(
                        starved_phase, self._seconds_since_last_served[starved_phase],
                        cfg.hard_starvation_limit_seconds,
                    ),
                )

        if self._seconds_in_current_phase < cfg.min_green_seconds[self._current_phase]:
            return self._hold(
                phase_scores, lane_scores, "min_green_hold",
                "{} has not yet reached its {:.0f}s minimum green ({:.1f}s elapsed).".format(
                    self._current_phase, cfg.min_green_seconds[self._current_phase],
                    self._seconds_in_current_phase,
                ),
            )

        best_other = max(
            (name for name in PHASE_NAMES if name != self._current_phase),
            key=lambda name: phase_scores[name],
        )

        # Gap-out: the current phase's OWN exclusive lanes have gone
        # genuinely empty (raw vehicle count, not the blended/predicted
        # score - a phase with nobody on it right now should never be
        # held open on the strength of a maybe-future prediction) and
        # some other phase actually has demand. Mirrors
        # performance.baseline_controllers.VehicleActuatedController's
        # own gap-out exactly (same definition, same min-green gate),
        # by design: this is what closes the light-traffic gap where
        # VAC's willingness to release an empty phase immediately used
        # to beat the AI's more conservative, score-only logic.
        # features.total_vehicle_count (network-wide), not
        # phase_scores[best_other], is the right guard here: a phase
        # score can be nonzero purely from accumulated starvation
        # pressure even with zero actual vehicles anywhere, which would
        # otherwise gap-out into an equally-empty phase for no benefit
        # (and needlessly count as a switch against the anti-flicker goal).
        current_exclusive_count = self._exclusive_vehicle_count(self._current_phase, features)
        if current_exclusive_count == 0 and features.total_vehicle_count > 0:
            # Which phase to release TO is a present-demand question
            # (see DecisionConfig.gap_out_uses_present_demand): rank the
            # alternatives on what is physically on their lanes now, not
            # on what the model expects to arrive. Starvation pressure
            # still applies through _phase_scores, so a long-unserved
            # phase keeps its due.
            gap_out_target = best_other
            if cfg.gap_out_uses_present_demand:
                present_scores = self._phase_scores({
                    lane_id: self._lane_score(lane_id, features, None)
                    for lane_id in ALL_APPROACH_LANES
                }, features)
                # Count first - VAC's own rule, and the greedy-optimal
                # choice for queue length - with the wait-aware present
                # score (which carries the capped starvation pressure,
                # i.e. "least recently served" for the first 20 s) deciding
                # only between phases holding the same number of
                # vehicles. A pure round-robin tie-break on the raw
                # unserved timer was tried instead and lost on light
                # traffic (Section 26.4b).
                gap_out_target = max(
                    (name for name in PHASE_NAMES if name != self._current_phase),
                    key=lambda name: (
                        self._exclusive_vehicle_count(name, features),
                        present_scores[name],
                    ),
                )
            return self._switch_to(
                gap_out_target, phase_scores, lane_scores, "gap_out",
                "{}'s exclusive lanes are empty (0 vehicles) after its {:.0f}s minimum "
                "green - releasing early to {} rather than holding an unused phase.".format(
                    self._current_phase, cfg.min_green_seconds[self._current_phase], gap_out_target
                ),
            )

        if self._seconds_in_current_phase >= cfg.max_green_seconds[self._current_phase]:
            return self._switch_to(
                best_other, phase_scores, lane_scores, "priority",
                "{} reached its {:.0f}s maximum green - switching to highest-scoring "
                "alternative {}.".format(
                    self._current_phase, cfg.max_green_seconds[self._current_phase], best_other
                ),
            )

        # LIGHT-TRAFFIC MODE: below light_traffic_congestion_threshold,
        # the scored/predictive preemption switch below is disabled
        # entirely. Empirically, a real adaptive baseline's pure "never
        # abandon a still-active phase" patience beats score-based
        # preemption specifically when demand is this light - there is
        # rarely a genuinely urgent competing need yet, so preempting a
        # still-active phase on a marginal score edge only adds switches
        # a patient policy would not have made. Gap-out (above),
        # max-green (above), hard starvation, and emergency (both
        # earlier in decide()) are UNAFFECTED - this only suppresses the
        # scored-preference path. See decision_config.py's field comment
        # and PROJECT_ARCHITECTURE_REPORT.md Section 20 for the A/B
        # evidence this threshold was tuned against.
        if congestion_index < cfg.light_traffic_congestion_threshold:
            self._candidate_phase = None
            self._candidate_seconds = 0.0
            return self._hold(
                phase_scores, lane_scores, "light_traffic_patience",
                "congestion_index={:.3f} is below the {:.2f} light-traffic threshold - "
                "extending {} patiently rather than preempting on a scored edge; only "
                "gap-out/max-green/starvation/emergency can switch this lightly loaded.".format(
                    congestion_index, cfg.light_traffic_congestion_threshold, self._current_phase,
                ),
            )

        # A phase still serving traffic keeps its green for a realistic
        # minimum before a mere score can take it away (see
        # DecisionConfig.min_green_before_preemption_seconds). Everything
        # above this line - emergency, hard starvation, gap-out,
        # max-green - has already had its chance; only the scored
        # preference is held back.
        preempt_floor = cfg.min_green_before_preemption_seconds[self._current_phase]
        if (
            self._seconds_in_current_phase < preempt_floor
            and phase_scores[self._current_phase] >= cfg.preemption_floor_min_phase_score
        ):
            self._candidate_phase = None
            self._candidate_seconds = 0.0
            return self._hold(
                phase_scores, lane_scores, "priority",
                "Extending {} ({:.1f}s of its {:.0f}s minimum green before a scored "
                "switch may end it).".format(
                    self._current_phase, self._seconds_in_current_phase, preempt_floor,
                ),
            )

        effective_margin = self._last_margin
        leads = phase_scores[best_other] > phase_scores[self._current_phase] + effective_margin

        if not leads:
            self._candidate_phase = None
            self._candidate_seconds = 0.0
            return self._hold(
                phase_scores, lane_scores, "priority",
                "Extending {} (score {:.3f}); best alternative {} (score {:.3f}) does not "
                "exceed the {:.2f} effective hysteresis margin (congestion_index={:.2f}).".format(
                    self._current_phase, phase_scores[self._current_phase],
                    best_other, phase_scores[best_other], effective_margin, congestion_index,
                ),
            )

        # leads is True: best_other has beaten the margin THIS tick, but
        # an ordinary preference-based switch is only committed once the
        # SAME candidate has led for switch_confirmation_seconds
        # consecutively - a real-world debounce against a transient 2-3
        # vehicle blip flipping the signal and then immediately
        # reverting. Gap-out and the hard starvation guarantee above
        # both bypass this deliberately; only this scored-preference
        # path needs it, since it is the one genuinely noisy signal.
        if best_other == self._candidate_phase:
            self._candidate_seconds += dt_seconds
        else:
            self._candidate_phase = best_other
            self._candidate_seconds = dt_seconds

        if self._candidate_seconds < cfg.switch_confirmation_seconds:
            return self._hold(
                phase_scores, lane_scores, "priority",
                "{} (score {:.3f}) leads {} (score {:.3f}) by more than the {:.2f} "
                "effective margin, but only for {:.1f}s of the {:.0f}s confirmation "
                "window - holding {} until confirmed.".format(
                    best_other, phase_scores[best_other], self._current_phase,
                    phase_scores[self._current_phase], effective_margin,
                    self._candidate_seconds, cfg.switch_confirmation_seconds,
                    self._current_phase,
                ),
            )

        return self._switch_to(
            best_other, phase_scores, lane_scores, "priority",
            "{} (score {:.3f}) has led {} (score {:.3f}) by more than the {:.2f} "
            "effective hysteresis margin for {:.1f}s (confirmation window {:.0f}s) - "
            "switching.".format(
                best_other, phase_scores[best_other], self._current_phase,
                phase_scores[self._current_phase], effective_margin,
                self._candidate_seconds, cfg.switch_confirmation_seconds,
            ),
        )

    # ===================== Scoring =====================

    def _lane_score(
        self, lane_id: str, features: TrafficFeatures, prediction: Optional[TrafficPrediction]
    ) -> float:
        cfg = self._config
        lane = features.lane_features.get(lane_id)
        vehicle_count = lane.vehicle_count if lane is not None else 0.0
        waiting_time = lane.average_waiting_time if lane is not None else 0.0
        max_waiting_time = lane.max_waiting_time if lane is not None else 0.0

        # Mean waiting time can look fine while one specific vehicle has
        # been sitting far longer than everyone else on the same lane -
        # max_waiting_time gives that vehicle direct representation in
        # the score, targeting worst-case travel time specifically
        # rather than only the average case.
        current_component = (
            0.6 * min(1.0, vehicle_count / cfg.norm_vehicle_count)
            + cfg.average_waiting_time_influence * min(1.0, waiting_time / cfg.norm_waiting_time_seconds)
            + cfg.max_waiting_time_influence * min(1.0, max_waiting_time / cfg.norm_waiting_time_seconds)
        )

        lane_prediction = prediction.lane_predictions.get(lane_id) if prediction is not None else None
        if lane_prediction is None:
            return max(0.0, min(1.0, current_component))

        # No predicted_max_waiting_time exists (LanePrediction only
        # forecasts vehicle_count/average_waiting_time - adding a third
        # ML target is a retraining-scale change, not made here), so the
        # predicted component keeps the original single mean-wait split.
        # This is an honest limitation, not an oversight: the current
        # component's max-wait awareness (above) still applies at full
        # strength whenever confidence is low, and confidence-weighted
        # blending means the predicted component's coarser view of
        # waiting time only partially dilutes it even at high confidence.
        predicted_component = (
            0.6 * min(1.0, lane_prediction.predicted_vehicle_count / cfg.norm_vehicle_count)
            + 0.4 * min(1.0, lane_prediction.predicted_average_waiting_time / cfg.norm_waiting_time_seconds)
        )
        confidence_fraction = max(0.0, min(1.0, lane_prediction.confidence / 100.0))
        w_predicted = cfg.max_predicted_weight * confidence_fraction
        w_current = 1.0 - w_predicted

        blended = w_current * current_component + w_predicted * predicted_component
        return max(0.0, min(1.0, blended))

    def _phase_scores(
        self, lane_scores: Dict[str, float], features: TrafficFeatures
    ) -> Dict[str, float]:
        cfg = self._config

        scores = {}
        for phase_name in PHASE_NAMES:
            # Every lane belongs to exactly one phase since left turns
            # became protected, so a phase's urgency is simply the worst
            # of its own lanes. The left-turn bonus this used to add on
            # top is gone deliberately, not lost: left demand is already
            # inside this max now, and adding it again would count it
            # twice for the phase that actually serves it.
            score = max(
                lane_scores[lane_id] for lane_id in _PHASE_EXCLUSIVE_LANES[phase_name]
            )
            # Capped (see DecisionConfig.starvation_pressure_cap): soft
            # pressure alone must never be able to clear
            # switch_hysteresis_margin by itself - only the explicit hard
            # starvation guarantee (_most_starved_phase_over_hard_limit)
            # may force a switch on unserved-time alone. The current
            # phase's own entry is always exactly 0.0 here (see
            # _switch_to's reset of new_phase's timer), so min(..., 0.0)
            # correctly contributes nothing regardless of the cap value.
            # ... and only for a phase somebody is actually waiting on
            # (see DecisionConfig.starvation_requires_demand).
            if self._has_present_demand(phase_name, features):
                score += min(
                    cfg.starvation_pressure_cap,
                    cfg.starvation_rate_per_second * self._seconds_since_last_served[phase_name],
                )
            scores[phase_name] = score
        return scores

    def _has_present_demand(self, phase_name: str, features: TrafficFeatures) -> bool:
        """
        True if starvation may count for phase_name right now: either
        the demand gate is off, or at least one vehicle is physically on
        one of the phase's lanes.
        """
        if not self._config.starvation_requires_demand:
            return True
        return self._exclusive_vehicle_count(phase_name, features) > 0

    @staticmethod
    def _exclusive_vehicle_count(phase_name: str, features: TrafficFeatures) -> int:
        """
        Raw (unblended, unpredicted) vehicle count on every lane
        phase_name serves - which since left turns became protected is
        all of them, left lanes included. That is the correct behaviour
        for gap-out: this phase is now the ONLY one that will serve
        those left-turners, so a queue of them is a real reason to hold
        on, where previously it was not. Deliberately ignores ML
        prediction (see decide()'s gap-out comment for why). Mirrors
        performance.baseline_controllers.VehicleActuatedController.
        _exclusive_demand exactly, for a fair, symmetric comparison.
        """
        total = 0
        for lane_id in _PHASE_EXCLUSIVE_LANES[phase_name]:
            lane = features.lane_features.get(lane_id)
            if lane is not None:
                total += lane.vehicle_count
        return total

    def _most_starved_phase_over_hard_limit(self, features: TrafficFeatures) -> Optional[str]:
        limit = self._config.hard_starvation_limit_seconds
        over_limit = [
            name for name in PHASE_NAMES
            if self._seconds_since_last_served[name] >= limit
            and self._has_present_demand(name, features)
        ]
        if not over_limit:
            return None
        return max(over_limit, key=lambda name: self._seconds_since_last_served[name])

    @staticmethod
    def _select_emergency_phase(emergency_lanes: FrozenSet[str]) -> Optional[str]:
        if not emergency_lanes:
            return None
        for phase_name in PHASE_NAMES:
            # No shared lanes any more, so the phase that serves an
            # emergency lane is unambiguous - previously a left-turn
            # emergency matched whichever main phase was checked first.
            if set(_PHASE_EXCLUSIVE_LANES[phase_name]) & emergency_lanes:
                return phase_name
        return None

    # ===================== State transitions =====================

    def _hold(
        self, phase_scores: Dict[str, float], lane_scores: Dict[str, float],
        mode: str, reason: str,
    ) -> Decision:
        return Decision(
            active_phase=self._current_phase,
            green_duration_seconds=self._seconds_in_current_phase,
            switched=False,
            decision_mode=mode,
            reason_text=reason,
            phase_scores=dict(phase_scores),
            lane_scores=dict(lane_scores),
            switch_margin=self._last_margin,
        )

    def _switch_to(
        self, new_phase: str, phase_scores: Dict[str, float], lane_scores: Dict[str, float],
        mode: str, reason: str, hold_seconds: float = 0.0,
    ) -> Decision:
        self._seconds_since_last_served[self._current_phase] = 0.0
        self._current_phase = new_phase
        self._seconds_in_current_phase = 0.0
        # BUG FIX (Section 20, mechanism A3): the phase just switched TO
        # also needs its own timer reset - without this, new_phase enters
        # its green carrying whatever "seconds unserved" value it had
        # accumulated right up to this switch (frozen there, since the
        # per-tick increment loop in decide() skips the current phase),
        # inflating its own _phase_scores entry for its entire green and
        # silently disabling mid-green preemption exactly when a phase
        # has been held longest. Also fixes a related bug: without this,
        # _most_starved_phase_over_hard_limit()'s max() could return the
        # phase that is now CURRENT (its stale timer still >= the hard
        # limit), which the `!= self._current_phase` guard correctly
        # no-ops on - but that no-op then silently masks a DIFFERENT
        # phase that has also crossed the hard limit. Resetting here
        # guarantees the current phase's timer is always exactly 0.0 for
        # its entire tenure (the increment loop already never touches
        # it), so it can never appear in that list at all.
        self._seconds_since_last_served[new_phase] = 0.0
        if hold_seconds > 0.0:
            self._emergency_hold_remaining = hold_seconds
        # Any switch - gap-out, emergency, hard starvation, or a
        # confirmed ordinary preference switch - starts the next phase
        # with a clean slate; a stale candidate/timer from before this
        # switch must never carry over.
        self._candidate_phase = None
        self._candidate_seconds = 0.0
        return Decision(
            active_phase=new_phase,
            green_duration_seconds=0.0,
            switched=True,
            decision_mode=mode,
            reason_text=reason,
            phase_scores=dict(phase_scores),
            lane_scores=dict(lane_scores),
            switch_margin=self._last_margin,
        )
