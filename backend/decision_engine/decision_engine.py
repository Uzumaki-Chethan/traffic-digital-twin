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
  NS_straight_left (base 30s green + 3s yellow): serves S_in_1, N_in_1
    (exclusive) plus all 4 left-turn lanes (shared with EW_straight_left,
    since every left turn has zero foes and is compatible with every
    other movement at all times per the network's own comments).
  NS_right (base 12s + 3s yellow): serves S_in_2, N_in_2 exclusively.
  EW_straight_left (base 30s + 3s yellow): serves E_in_1, W_in_1
    (exclusive) plus the same 4 shared left-turn lanes.
  EW_right (base 12s + 3s yellow): serves E_in_2, W_in_2 exclusively.

Because the 4 left-turn lanes are served by EITHER main phase, they must
not tip the balance between NS_straight_left and EW_straight_left (a lane
that gets green either way is indifferent to which one runs) - but they
DO argue against ever running a right-only phase, since neither right
phase serves them at all. This is encoded directly in _phase_scores()
via a partial-weight left-turn bonus applied only to the two main phases.

Yellow/all-red clearance (3s, from the frozen .tll.xml) is NOT decided
here - this engine only ever outputs a green duration; the future Signal
Controller is responsible for inserting the fixed clearance interval
between any two phases, exactly as SUMO's own protected-phase design
already requires.
"""

from dataclasses import dataclass, field
from typing import Dict, FrozenSet, Mapping, Optional, Tuple

from models import TrafficFeatures, TrafficPrediction

# ===================== Verified phase/lane structure =====================

PHASE_NAMES: Tuple[str, ...] = (
    "NS_straight_left", "NS_right", "EW_straight_left", "EW_right",
)

_PHASE_EXCLUSIVE_LANES: Dict[str, Tuple[str, ...]] = {
    "NS_straight_left": ("S_in_1", "N_in_1"),
    "NS_right": ("S_in_2", "N_in_2"),
    "EW_straight_left": ("E_in_1", "W_in_1"),
    "EW_right": ("E_in_2", "W_in_2"),
}

_LEFT_TURN_LANES: Tuple[str, ...] = ("S_in_0", "N_in_0", "E_in_0", "W_in_0")
_MAIN_PHASES: FrozenSet[str] = frozenset({"NS_straight_left", "EW_straight_left"})

# How much a main phase's score is influenced by left-turn demand,
# relative to its own exclusive straight-lane demand. 0.3 was chosen so
# left-turn urgency can meaningfully extend a main phase's green (or
# argue against switching to a right-only phase) without ever letting
# left demand alone dictate which of the two main phases runs - that
# choice should be driven by the exclusive straight lanes, which are
# genuinely different between NS and EW, whereas left demand is not.
_LEFT_TURN_INFLUENCE = 0.3

ALL_APPROACH_LANES: Tuple[str, ...] = (
    "N_in_0", "N_in_1", "N_in_2", "S_in_0", "S_in_1", "S_in_2",
    "E_in_0", "E_in_1", "E_in_2", "W_in_0", "W_in_1", "W_in_2",
)

# ===================== Tunable constants =====================

MIN_GREEN_SECONDS: Dict[str, float] = {
    "NS_straight_left": 10.0, "EW_straight_left": 10.0,
    "NS_right": 8.0, "EW_right": 8.0,
}
MAX_GREEN_SECONDS: Dict[str, float] = {
    "NS_straight_left": 45.0, "EW_straight_left": 45.0,
    "NS_right": 20.0, "EW_right": 20.0,
}

# Normalization ceilings for turning a raw vehicle_count / waiting_time
# into a 0-1 urgency term. Starting points grounded in this network's
# scale (a single 3-lane-per-approach junction, not a multi-lane
# boulevard), not empirically fitted against final training data - flag
# these as the first thing to tune once real Performance Evaluation
# metrics (Section 10.7) are available.
NORM_VEHICLE_COUNT = 20.0
NORM_WAITING_TIME_SECONDS = 60.0

# A candidate phase must beat the current phase's score by more than
# this margin to trigger a switch before max green is reached. Without
# this, a system would flip-flop between two nearly-tied phases every
# tick, burning clearance time (3s yellow each switch) on ties that
# don't matter - hysteresis is standard practice in adaptive signal
# control for exactly this reason.
SWITCH_HYSTERESIS_MARGIN = 0.08

# Added after observing real gridlock-scenario logs: under simultaneous
# oversaturation on every approach (not just one heavy direction, which
# is all the original design was tested against), every phase's score
# climbs together, so the fixed 0.08 margin above gets cleared almost
# immediately every time a phase's own minimum green elapses. The
# observed result was every phase running close to its bare minimum
# green on a repeating ~53s cycle, with yellow clearance eating 22.6%
# of total time (vs 12.5% on the original fixed-timer program) and
# main-street phases getting a SMALLER share of green (47.2%) than
# under the naive fixed timer (62.5%) despite carrying more demand -
# the opposite of what adaptive control should do under heavy load.
# Standard traffic engineering response to oversaturation is fewer,
# longer phases (less time lost to clearance), not more frequent ones.
# congestion_index (mean priority score across all 12 lanes, computed
# once per decide() call) scales the margin up as the whole junction
# saturates, making a switch require a clearly-better alternative
# rather than a marginal one, which lets busy phases run further
# toward their MAX_GREEN instead of bailing at the first opportunity.
OVERSATURATION_MARGIN_BONUS = 0.25

# Soft starvation pressure: added to a phase's score for every second
# it goes unserved, so a chronically low-demand phase's score still
# climbs over time even if it never spikes on its own.
STARVATION_RATE_PER_SECOND = 0.01

# Hard starvation ceiling: once a phase has gone this long without being
# served, it is force-served the instant the current phase's min green
# is satisfied, regardless of score - a guarantee, not a bias, so no
# phase can be starved indefinitely by an unlucky score sequence.
HARD_STARVATION_LIMIT_SECONDS = 150.0

# Emergency handling: the absolute minimum green the CURRENT phase gets
# before an emergency override is allowed to cut it short - never a
# true zero-warning instant switch (unsafe: vehicles already committed
# to crossing need some minimum clearance), but far below a phase's
# normal min green.
EMERGENCY_MINIMUM_SAFETY_SECONDS = 5.0
# Once switched for an emergency, the emergency phase is held at least
# this long before normal priority scoring resumes, so the emergency
# vehicle has a real window to clear the junction rather than losing
# its green the instant a competing score edges ahead.
EMERGENCY_SERVICE_WINDOW_SECONDS = 15.0

# How much of the predicted component's weight is used at full (100)
# confidence - see the module-level design note: prediction never fully
# replaces current state's influence, even at perfect confidence.
MAX_PREDICTED_WEIGHT = 0.35


@dataclass(frozen=True)
class Decision:
    """
    Desired State output - written by DecisionEngine, read by the future
    Signal Controller. Never mutated after creation.
    """
    active_phase: str
    green_duration_seconds: float
    switched: bool
    decision_mode: str  # "priority" | "emergency" | "starvation_override" | "min_green_hold"
    reason_text: str
    phase_scores: Mapping[str, float]


class DecisionEngine:
    """
    Stateful phase-selection engine. One instance per intersection.
    """

    def __init__(self, initial_phase: str = "NS_straight_left"):
        if initial_phase not in PHASE_NAMES:
            raise ValueError(
                "initial_phase must be one of {}, got {!r}".format(PHASE_NAMES, initial_phase)
            )
        self._current_phase = initial_phase
        self._seconds_in_current_phase = 0.0
        self._seconds_since_last_served: Dict[str, float] = {name: 0.0 for name in PHASE_NAMES}
        self._emergency_hold_remaining = 0.0

    @property
    def current_phase(self) -> str:
        return self._current_phase

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
        phase_scores = self._phase_scores(lane_scores)
        congestion_index = sum(lane_scores.values()) / len(lane_scores)

        emergency_phase = self._select_emergency_phase(emergency_lanes)
        if emergency_phase is not None and emergency_phase != self._current_phase:
            if self._seconds_in_current_phase >= EMERGENCY_MINIMUM_SAFETY_SECONDS:
                return self._switch_to(
                    emergency_phase, phase_scores, "emergency",
                    "Emergency vehicle detected on a lane served by {}; overriding after "
                    "{:.1f}s minimum safety green on {}.".format(
                        emergency_phase, self._seconds_in_current_phase, self._current_phase
                    ),
                    hold_seconds=EMERGENCY_SERVICE_WINDOW_SECONDS,
                )
        if emergency_phase is not None and emergency_phase == self._current_phase:
            self._emergency_hold_remaining = max(
                self._emergency_hold_remaining, EMERGENCY_SERVICE_WINDOW_SECONDS
            )

        if self._emergency_hold_remaining > 0.0:
            return self._hold(
                phase_scores, "emergency",
                "Holding {} for emergency service window ({:.1f}s remaining).".format(
                    self._current_phase, self._emergency_hold_remaining
                ),
            )

        starved_phase = self._most_starved_phase_over_hard_limit()
        if starved_phase is not None and starved_phase != self._current_phase:
            if self._seconds_in_current_phase >= MIN_GREEN_SECONDS[self._current_phase]:
                return self._switch_to(
                    starved_phase, phase_scores, "starvation_override",
                    "{} unserved for {:.1f}s (hard limit {:.0f}s) - force-serving regardless "
                    "of score.".format(
                        starved_phase, self._seconds_since_last_served[starved_phase],
                        HARD_STARVATION_LIMIT_SECONDS,
                    ),
                )

        if self._seconds_in_current_phase < MIN_GREEN_SECONDS[self._current_phase]:
            return self._hold(
                phase_scores, "min_green_hold",
                "{} has not yet reached its {:.0f}s minimum green ({:.1f}s elapsed).".format(
                    self._current_phase, MIN_GREEN_SECONDS[self._current_phase],
                    self._seconds_in_current_phase,
                ),
            )

        best_other = max(
            (name for name in PHASE_NAMES if name != self._current_phase),
            key=lambda name: phase_scores[name],
        )

        if self._seconds_in_current_phase >= MAX_GREEN_SECONDS[self._current_phase]:
            return self._switch_to(
                best_other, phase_scores, "priority",
                "{} reached its {:.0f}s maximum green - switching to highest-scoring "
                "alternative {}.".format(
                    self._current_phase, MAX_GREEN_SECONDS[self._current_phase], best_other
                ),
            )

        effective_margin = SWITCH_HYSTERESIS_MARGIN + OVERSATURATION_MARGIN_BONUS * congestion_index

        if phase_scores[best_other] > phase_scores[self._current_phase] + effective_margin:
            return self._switch_to(
                best_other, phase_scores, "priority",
                "{} (score {:.3f}) exceeds {} (score {:.3f}) by more than the {:.2f} "
                "effective hysteresis margin ({:.2f} base + {:.2f} oversaturation, "
                "congestion_index={:.2f}).".format(
                    best_other, phase_scores[best_other], self._current_phase,
                    phase_scores[self._current_phase], effective_margin,
                    SWITCH_HYSTERESIS_MARGIN, effective_margin - SWITCH_HYSTERESIS_MARGIN,
                    congestion_index,
                ),
            )

        return self._hold(
            phase_scores, "priority",
            "Extending {} (score {:.3f}); best alternative {} (score {:.3f}) does not "
            "exceed the {:.2f} effective hysteresis margin (congestion_index={:.2f}).".format(
                self._current_phase, phase_scores[self._current_phase],
                best_other, phase_scores[best_other], effective_margin, congestion_index,
            ),
        )

    # ===================== Scoring =====================

    @staticmethod
    def _lane_score(
        lane_id: str, features: TrafficFeatures, prediction: Optional[TrafficPrediction]
    ) -> float:
        lane = features.lane_features.get(lane_id)
        vehicle_count = lane.vehicle_count if lane is not None else 0.0
        waiting_time = lane.average_waiting_time if lane is not None else 0.0

        current_component = (
            0.6 * min(1.0, vehicle_count / NORM_VEHICLE_COUNT)
            + 0.4 * min(1.0, waiting_time / NORM_WAITING_TIME_SECONDS)
        )

        lane_prediction = prediction.lane_predictions.get(lane_id) if prediction is not None else None
        if lane_prediction is None:
            return max(0.0, min(1.0, current_component))

        predicted_component = (
            0.6 * min(1.0, lane_prediction.predicted_vehicle_count / NORM_VEHICLE_COUNT)
            + 0.4 * min(1.0, lane_prediction.predicted_average_waiting_time / NORM_WAITING_TIME_SECONDS)
        )
        confidence_fraction = max(0.0, min(1.0, lane_prediction.confidence / 100.0))
        w_predicted = MAX_PREDICTED_WEIGHT * confidence_fraction
        w_current = 1.0 - w_predicted

        blended = w_current * current_component + w_predicted * predicted_component
        return max(0.0, min(1.0, blended))

    def _phase_scores(self, lane_scores: Dict[str, float]) -> Dict[str, float]:
        left_turn_urgency = max(lane_scores[lane_id] for lane_id in _LEFT_TURN_LANES)

        scores = {}
        for phase_name in PHASE_NAMES:
            exclusive_urgency = max(
                lane_scores[lane_id] for lane_id in _PHASE_EXCLUSIVE_LANES[phase_name]
            )
            if phase_name in _MAIN_PHASES:
                score = exclusive_urgency + _LEFT_TURN_INFLUENCE * left_turn_urgency
            else:
                score = exclusive_urgency
            score += STARVATION_RATE_PER_SECOND * self._seconds_since_last_served[phase_name]
            scores[phase_name] = score
        return scores

    def _most_starved_phase_over_hard_limit(self) -> Optional[str]:
        over_limit = [
            name for name in PHASE_NAMES
            if self._seconds_since_last_served[name] >= HARD_STARVATION_LIMIT_SECONDS
        ]
        if not over_limit:
            return None
        return max(over_limit, key=lambda name: self._seconds_since_last_served[name])

    @staticmethod
    def _select_emergency_phase(emergency_lanes: FrozenSet[str]) -> Optional[str]:
        if not emergency_lanes:
            return None
        for phase_name in PHASE_NAMES:
            served = set(_PHASE_EXCLUSIVE_LANES[phase_name])
            if phase_name in _MAIN_PHASES:
                served |= set(_LEFT_TURN_LANES)
            if served & emergency_lanes:
                return phase_name
        return None

    # ===================== State transitions =====================

    def _hold(self, phase_scores: Dict[str, float], mode: str, reason: str) -> Decision:
        return Decision(
            active_phase=self._current_phase,
            green_duration_seconds=self._seconds_in_current_phase,
            switched=False,
            decision_mode=mode,
            reason_text=reason,
            phase_scores=dict(phase_scores),
        )

    def _switch_to(
        self, new_phase: str, phase_scores: Dict[str, float], mode: str, reason: str,
        hold_seconds: float = 0.0,
    ) -> Decision:
        self._seconds_since_last_served[self._current_phase] = 0.0
        self._current_phase = new_phase
        self._seconds_in_current_phase = 0.0
        if hold_seconds > 0.0:
            self._emergency_hold_remaining = hold_seconds
        return Decision(
            active_phase=new_phase,
            green_duration_seconds=0.0,
            switched=True,
            decision_mode=mode,
            reason_text=reason,
            phase_scores=dict(phase_scores),
        )