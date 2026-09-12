/**
 * Frontend-side mirror of backend/decision_engine/decision_config.py's
 * _default_min_green / _default_max_green. These are static config, not
 * runtime output — the snapshot does not carry them — so they are
 * duplicated here to draw the constraint window. If the backend defaults
 * are retuned, update these too.
 */
export const MIN_GREEN: Record<string, number> = {
  NS_straight_left: 10,
  EW_straight_left: 10,
  NS_right: 8,
  EW_right: 8,
}
export const MAX_GREEN: Record<string, number> = {
  NS_straight_left: 45,
  EW_straight_left: 45,
  NS_right: 20,
  EW_right: 20,
}
/** signal_controller.py: YELLOW_DURATION_SECONDS */
export const YELLOW_SECONDS = 3
