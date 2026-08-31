import type { PhaseName } from '@/types/snapshot'

/**
 * Mirrors backend/decision_engine/decision_engine.py's MIN_GREEN_SECONDS /
 * MAX_GREEN_SECONDS. These are fixed constants in that file, not runtime
 * output, so duplicating them here for the countdown-ring visualization
 * does not create a hidden dependency on live backend data - but if
 * those constants are ever retuned, update them here too.
 */
export const MIN_GREEN_SECONDS: Record<PhaseName, number> = {
  NS_straight_left: 10,
  EW_straight_left: 10,
  NS_right: 8,
  EW_right: 8,
}

export const MAX_GREEN_SECONDS: Record<PhaseName, number> = {
  NS_straight_left: 45,
  EW_straight_left: 45,
  NS_right: 20,
  EW_right: 20,
}

export const YELLOW_DURATION_SECONDS = 3
