"""
signal_controller.py
======================
Executes Decision objects from DecisionEngine against SUMO via TraCI.
Contains NO decision logic - every phase/duration choice belongs to
DecisionEngine; this module only ever realizes what a Decision already
says to do, safely.

PHASE INDEX MAPPING - verified against the real, frozen
sumo/network/intersection.tll.xml, NOT the {0,1,2,3} originally assumed:
    index 0 = NS_straight_left (green, 30s)
    index 1 = yellow clearance out of NS_straight_left (3s)
    index 2 = NS_right (green, 12s)
    index 3 = yellow clearance out of NS_right (3s)
    index 4 = EW_straight_left (green, 30s)
    index 5 = yellow clearance out of EW_straight_left (3s)
    index 6 = EW_right (green, 12s)
    index 7 = yellow clearance out of EW_right (3s)
Every green is at an even index; its own yellow is always index+1.

WHY THIS CONTROLLER TRACKS ONE SMALL PIECE OF STATE (a pending
transition), not zero: this tlLogic program has type="static" (confirmed
in the file, not assumed) - a strictly sequential program that does NOT
auto-insert a yellow when setPhase() jumps out of sequence. Calling
setPhase() straight from one green index to another would apply the new
green's state string immediately, with conflicting movements changing
simultaneously and no clearance interval at all - a real safety defect,
not a style choice. So a switch is executed as two steps across two
ticks: begin the correct yellow (already defined in the program) and
hold it for its own real 3s, THEN apply the target green - never both in
the same instant. This is still pure execution, not decision-making:
which phase to end up in and for how long remains entirely
DecisionEngine's call; this only ensures getting there is safe.
"""

import logging

import traci

logger = logging.getLogger(__name__)

PHASE_TO_INDEX = {
    "NS_straight_left": 0,
    "NS_right": 2,
    "EW_straight_left": 4,
    "EW_right": 6,
}

YELLOW_DURATION_SECONDS = 3.0

# SUMO-side duration set on a just-applied green phase, refreshed every
# tick. Not the actual intended hold length (DecisionEngine re-affirms
# or changes that every tick) - just a generous ceiling so this static
# program never auto-advances on its own between two apply_decision()
# calls.
PROVISIONAL_HOLD_SECONDS = 60.0


class SignalController:
    """
    Executes Decision objects. tls_id must match the real traffic light
    ID in the network ("C" in intersection.tll.xml).

    traci_connection: optional explicit TraCI Connection object. When
    None, commands go through the module-level default connection
    (classic single-simulation behaviour, app.py). Performance
    Evaluation passes the AI simulation's own labeled connection here,
    because with two parallel SUMO instances the module-level default
    connection is ambiguous - signal commands MUST land on the AI
    instance only, never on the baseline instance.
    """

    def __init__(self, tls_id: str, traci_connection=None):
        self._tls_id = tls_id
        self._traci = traci_connection if traci_connection is not None else traci
        self._pending_target_index = None
        self._transition_remaining_seconds = 0.0

    def apply_decision(self, decision, dt_seconds: float = 1.0) -> None:
        """
        Realize one Decision. dt_seconds is the elapsed time since the
        last call (matches DecisionEngine.decide()'s own signature) -
        needed to track a yellow transition in progress across ticks.
        """
        target_index = PHASE_TO_INDEX[decision.active_phase]

        if self._transition_remaining_seconds > 0.0:
            self._transition_remaining_seconds -= dt_seconds
            if self._transition_remaining_seconds > 0.0:
                # logger.debug, not print: apply_decision() runs once per
                # simulated second for the whole run, and unbuffered
                # console writes on Windows measurably slow long
                # evaluation runs. Enable DEBUG logging to see these.
                logger.debug(
                    "[%s] yellow clearance in progress (%.1fs remaining) - "
                    "holding before %s",
                    self._tls_id, self._transition_remaining_seconds,
                    decision.active_phase,
                )
                return
            self._traci.trafficlight.setPhase(self._tls_id, self._pending_target_index)
            self._traci.trafficlight.setPhaseDuration(self._tls_id, PROVISIONAL_HOLD_SECONDS)
            logger.debug(
                "[%s] applied phase %s (index %d) after yellow clearance "
                "(mode=%s)",
                self._tls_id, decision.active_phase,
                self._pending_target_index, decision.decision_mode,
            )
            self._pending_target_index = None
            return

        current_index = self._traci.trafficlight.getPhase(self._tls_id)

        if decision.switched and current_index != target_index:
            yellow_index = current_index + 1
            self._traci.trafficlight.setPhase(self._tls_id, yellow_index)
            self._traci.trafficlight.setPhaseDuration(self._tls_id, YELLOW_DURATION_SECONDS)
            self._pending_target_index = target_index
            self._transition_remaining_seconds = YELLOW_DURATION_SECONDS
            logger.debug(
                "[%s] starting yellow clearance (index %d, %.0fs) before "
                "switching to %s",
                self._tls_id, yellow_index, YELLOW_DURATION_SECONDS,
                decision.active_phase,
            )
            return

        self._traci.trafficlight.setPhaseDuration(self._tls_id, PROVISIONAL_HOLD_SECONDS)
        logger.debug(
            "[%s] extending %s (index %d), elapsed=%.1fs (mode=%s)",
            self._tls_id, decision.active_phase, target_index,
            decision.green_duration_seconds, decision.decision_mode,
        )
