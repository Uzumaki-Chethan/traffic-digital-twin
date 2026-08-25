"""
baseline_controllers.py
=======================
The two comparison baselines for Performance Evaluation, deliberately
implemented against the SAME Decision interface the ML DecisionEngine
uses. Both emit real Decision objects, so SignalController executes them
unchanged - identical yellow-clearance safety, identical 1 Hz decision
cadence, identical feature pipeline feeding them. The ONLY difference
between a baseline run and an AI run is which object sits behind
decide(), which is exactly what makes the comparison fair.

  FixedTimerController     The "before" picture: replays the frozen
                           network's own static program (30s / 12s /
                           30s / 12s greens from intersection.tll.xml),
                           blind to traffic.
  VehicleActuatedController A classic demand-responsive controller:
                           extends green while its approach still has
                           vehicles (max-out at MAX_GREEN), gaps out to
                           the highest-demand competing phase as soon as
                           min green is satisfied and its approach has
                           cleared. No prediction, no ML - pure
                           reactive loop detection logic.

Both import PHASE_NAMES / MIN_GREEN_SECONDS / MAX_GREEN_SECONDS /
_PHASE_EXCLUSIVE_LANES from decision_engine rather than redefining them:
those constants are verified facts about the frozen network and this
project's rule is one documented home per fact. Importing the
underscore-prefixed mapping explicitly is deliberate - it keeps a single
source of truth instead of a second copy that could silently drift.
"""

from typing import Dict, FrozenSet, Optional

from models import TrafficFeatures, TrafficPrediction
from decision_engine.decision_engine import (
    Decision,
    PHASE_NAMES,
    MIN_GREEN_SECONDS,
    MAX_GREEN_SECONDS,
    _PHASE_EXCLUSIVE_LANES,
)

# The frozen tlLogic's own base green durations (intersection.tll.xml):
# NS_straight_left 30s, NS_right 12s, EW_straight_left 30s, EW_right 12s.
# This IS the fixed-timer program the adaptive system must beat.
FIXED_TIMER_GREEN_SECONDS: Dict[str, float] = {
    "NS_straight_left": 30.0,
    "NS_right": 12.0,
    "EW_straight_left": 30.0,
    "EW_right": 12.0,
}


class FixedTimerController:
    """
    Blind cyclic control: serves each phase for exactly its programmed
    duration in PHASE_NAMES order, forever, regardless of demand.
    """

    decision_mode = "fixed_timer"

    def __init__(self, initial_phase: str = "NS_straight_left"):
        if initial_phase not in PHASE_NAMES:
            raise ValueError(
                "initial_phase must be one of {}, got {!r}".format(
                    PHASE_NAMES, initial_phase
                )
            )
        self._current_phase = initial_phase
        self._seconds_in_current_phase = 0.0

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
        # Signature matches DecisionEngine.decide() exactly; features,
        # prediction and emergency_lanes are intentionally ignored -
        # blindness to traffic is the entire point of this baseline.
        self._seconds_in_current_phase += dt_seconds

        if self._seconds_in_current_phase >= FIXED_TIMER_GREEN_SECONDS[self._current_phase]:
            next_index = (PHASE_NAMES.index(self._current_phase) + 1) % len(PHASE_NAMES)
            next_phase = PHASE_NAMES[next_index]
            reason = (
                "{} served its full {:.0f}s fixed green; cycling to {}.".format(
                    self._current_phase,
                    FIXED_TIMER_GREEN_SECONDS[self._current_phase],
                    next_phase,
                )
            )
            self._current_phase = next_phase
            self._seconds_in_current_phase = 0.0
            return Decision(
                active_phase=self._current_phase,
                green_duration_seconds=0.0,
                switched=True,
                decision_mode=self.decision_mode,
                reason_text=reason,
                phase_scores={},
            )

        return Decision(
            active_phase=self._current_phase,
            green_duration_seconds=self._seconds_in_current_phase,
            switched=False,
            decision_mode=self.decision_mode,
            reason_text="Holding {} ({:.1f}s of {:.0f}s fixed green).".format(
                self._current_phase,
                self._seconds_in_current_phase,
                FIXED_TIMER_GREEN_SECONDS[self._current_phase],
            ),
            phase_scores={},
        )


class VehicleActuatedController:
    """
    Classic fully-actuated-style control using only instantaneous lane
    occupancy (no ML, no prediction):

      - Before MIN_GREEN: always hold (safety floor, same as the AI).
      - After MIN_GREEN, if the current phase's exclusive lanes are
        empty (gap-out) OR MAX_GREEN is reached (max-out): switch to the
        competing phase with the highest exclusive-lane vehicle count.
      - Otherwise: extend while demand remains on the current approach.

    Left-turn lanes are ignored for demand here, mirroring how the AI's
    scoring treats right-only phases: neither right phase serves them,
    so counting them would bias both baselines identically-wrongly.
    """

    def __init__(self, initial_phase: str = "NS_straight_left"):
        if initial_phase not in PHASE_NAMES:
            raise ValueError(
                "initial_phase must be one of {}, got {!r}".format(
                    PHASE_NAMES, initial_phase
                )
            )
        self._current_phase = initial_phase
        self._seconds_in_current_phase = 0.0

    @property
    def current_phase(self) -> str:
        return self._current_phase

    def _exclusive_demand(self, phase_name: str, features: TrafficFeatures) -> int:
        """
        Total vehicles currently on a phase's exclusive lanes. Missing
        lane entries (empty early snapshots) count as zero demand.
        """
        total = 0
        for lane_id in _PHASE_EXCLUSIVE_LANES[phase_name]:
            lane = features.lane_features.get(lane_id)
            if lane is not None:
                total += lane.vehicle_count
        return total

    def decide(
        self,
        features: TrafficFeatures,
        prediction: Optional[TrafficPrediction],
        dt_seconds: float = 1.0,
        emergency_lanes: FrozenSet[str] = frozenset(),
    ) -> Decision:
        self._seconds_in_current_phase += dt_seconds

        if self._seconds_in_current_phase < MIN_GREEN_SECONDS[self._current_phase]:
            return Decision(
                active_phase=self._current_phase,
                green_duration_seconds=self._seconds_in_current_phase,
                switched=False,
                decision_mode="min_green_hold",
                reason_text=(
                    "{} has not yet reached its {:.0f}s minimum green "
                    "({:.1f}s elapsed).".format(
                        self._current_phase,
                        MIN_GREEN_SECONDS[self._current_phase],
                        self._seconds_in_current_phase,
                    )
                ),
                phase_scores={},
            )

        current_demand = self._exclusive_demand(self._current_phase, features)
        maxed_out = self._seconds_in_current_phase >= MAX_GREEN_SECONDS[self._current_phase]
        gapped_out = current_demand == 0

        if not (gapped_out or maxed_out):
            return Decision(
                active_phase=self._current_phase,
                green_duration_seconds=self._seconds_in_current_phase,
                switched=False,
                decision_mode="vac_extension",
                reason_text=(
                    "Extending {}: {} vehicles still on its approaches "
                    "(elapsed {:.1f}s).".format(
                        self._current_phase, current_demand,
                        self._seconds_in_current_phase,
                    )
                ),
                phase_scores={},
            )

        # Choose the competing phase with the most queued demand;
        # fall back to simple cycle order when everything is empty so
        # the signal never stalls on an all-clear network.
        best_other = None
        best_demand = -1
        for name in PHASE_NAMES:
            if name == self._current_phase:
                continue
            demand = self._exclusive_demand(name, features)
            if demand > best_demand:
                best_demand = demand
                best_other = name

        if best_other is None:
            best_other = PHASE_NAMES[
                (PHASE_NAMES.index(self._current_phase) + 1) % len(PHASE_NAMES)
            ]

        trigger = "max-out" if maxed_out else "gap-out"
        reason = (
            "{} {} after {:.1f}s ({} demand); switching to {} ({} waiting "
            "vehicles).".format(
                self._current_phase, trigger, self._seconds_in_current_phase,
                "zero" if gapped_out else "max green reached",
                best_other, max(best_demand, 0),
            )
        )
        self._current_phase = best_other
        self._seconds_in_current_phase = 0.0
        return Decision(
            active_phase=self._current_phase,
            green_duration_seconds=0.0,
            switched=True,
            decision_mode="vac_" + trigger,
            reason_text=reason,
            phase_scores={},
        )