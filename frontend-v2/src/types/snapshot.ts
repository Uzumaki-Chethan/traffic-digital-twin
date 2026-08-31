/**
 * Mirrors the exact snapshot dict shape published by the backend at
 * backend/services/live_state.py (LiveStateStore) and sent verbatim over
 * GET /api/latest and WS /ws (backend/services/dashboard_server.py).
 *
 * Two producers publish this shape:
 *   - backend/app.py           -> full snapshot, `signal`/`lanes`/`decision`
 *                                  populated, `comparison` is null.
 *   - backend/performance/evaluator.py (--dashboard mode)
 *                              -> `comparison` populated, `signal`/`lanes`/
 *                                 `decision` are null/empty (no live control
 *                                  loop feeds them in that mode).
 *
 * Before the simulation publishes its first snapshot, the server sends
 * `{ status: "waiting_for_simulation" }` instead - see WaitingSnapshot.
 */

export const APPROACH_LANES = [
  'N_in_0', 'N_in_1', 'N_in_2',
  'S_in_0', 'S_in_1', 'S_in_2',
  'E_in_0', 'E_in_1', 'E_in_2',
  'W_in_0', 'W_in_1', 'W_in_2',
] as const

export type LaneId = (typeof APPROACH_LANES)[number]
export type Approach = 'N' | 'S' | 'E' | 'W'

/** decision_engine.py Decision.decision_mode - the only 4 values it emits. */
export type DecisionMode =
  | 'priority'
  | 'emergency'
  | 'starvation_override'
  | 'min_green_hold'

/** decision_engine.py PHASE_NAMES - the only 4 values it emits. */
export type PhaseName =
  | 'NS_straight_left'
  | 'NS_right'
  | 'EW_straight_left'
  | 'EW_right'

/** Raw SUMO signal-state character for one lane, as sent in lanes[].signal. */
export type SumoSignalChar = 'G' | 'g' | 'y' | 'Y' | 'r' | 'R' | string

export interface SignalView {
  phase: PhaseName | string
  is_yellow: boolean
  green: boolean
  countdown: number
}

export interface MetricsView {
  vehicles: number
  avg_speed: number
  avg_wait: number
  queue: number
  stopped: number
}

export interface LaneView {
  lane_id: LaneId | string
  vehicles: number
  avg_wait: number
  signal: SumoSignalChar
}

export interface DecisionView {
  active_phase?: PhaseName | string
  mode?: DecisionMode | string
  switched?: boolean
  reason?: string
  /**
   * Seconds elapsed in the current phase. Requires the small additive
   * backend patch documented in backend/app.py (adds
   * decision.green_duration_seconds to the published payload) - falls
   * back to undefined gracefully if that patch hasn't been applied yet.
   */
  duration?: number
  /** Raw per-phase priority scores, same caveat as `duration` above. */
  phase_scores?: Record<string, number>
}

export interface PredictionRow {
  lane: LaneId | string
  pred_veh: number
  act_veh: number
  pred_wait: number
  act_wait: number
  confidence: number
}

export interface PredictionView {
  target_time: number
  rows: PredictionRow[]
  avg_confidence: number
}

/** One row of performance.evaluator.py's COMPARISON_METRICS. */
export interface ComparisonRow {
  key: string
  label: string
  ai: number
  baseline: number
  improvement: number
}

export interface ComparisonView {
  rows: ComparisonRow[]
}

export interface PhaseHistoryEntry {
  time: number
  phase: PhaseName | string
  is_yellow: boolean
}

export interface LiveSnapshot {
  sim_time: number
  signal: SignalView | null
  metrics: MetricsView
  lanes: LaneView[]
  decision: DecisionView
  emergency_lanes: string[]
  prediction: PredictionView | null
  comparison: ComparisonView | null
  phase_history: PhaseHistoryEntry[]
}

export interface WaitingSnapshot {
  status: 'waiting_for_simulation'
}

export type Snapshot = LiveSnapshot | WaitingSnapshot

export function isWaiting(s: Snapshot | null): s is WaitingSnapshot {
  return s !== null && 'status' in s
}

export function isLive(s: Snapshot | null): s is LiveSnapshot {
  return s !== null && 'sim_time' in s
}

/** Which compass approach a lane belongs to, derived from its id prefix. */
export function approachOf(laneId: string): Approach {
  return laneId.charAt(0) as Approach
}
