/**
 * The live snapshot contract, transcribed from the publishing side —
 * backend/app.py's LIVE_STATE.publish({...}) call and the Decision
 * dataclass in backend/decision_engine/decision_engine.py. If a field is
 * not here, the backend does not emit it and the UI must not show it.
 *
 * Two producers publish this shape over WS /ws and GET /api/latest:
 *   backend/app.py                       -> signal/lanes/decision populated, comparison null
 *   backend/performance/evaluator.py     -> comparison populated (--dashboard mode)
 * Before the first tick the server sends { status: "waiting_for_simulation" }.
 */

export const PHASE_NAMES = ['NS_straight_left', 'NS_right', 'EW_straight_left', 'EW_right'] as const
export type PhaseName = (typeof PHASE_NAMES)[number]

export const LANE_IDS = [
  'N_in_0', 'N_in_1', 'N_in_2',
  'S_in_0', 'S_in_1', 'S_in_2',
  'E_in_0', 'E_in_1', 'E_in_2',
  'W_in_0', 'W_in_1', 'W_in_2',
] as const
export type LaneId = (typeof LANE_IDS)[number]
export type Approach = 'N' | 'S' | 'E' | 'W'

/** decision_engine.py Decision.decision_mode — all six, verbatim. */
export const DECISION_MODES = [
  'priority',
  'gap_out',
  'light_traffic_patience',
  'emergency',
  'starvation_override',
  'min_green_hold',
] as const
export type DecisionMode = (typeof DECISION_MODES)[number]

/** Raw SUMO signal-state character for a lane. Mapped explicitly in
 * utils/signal.ts — do not assume only three cases. */
export type SumoSignalChar = string

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
  active_phase: PhaseName | string
  mode: DecisionMode | string
  switched: boolean
  reason: string
  duration: number
  phase_scores: Record<string, number>
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

export interface ComparisonRow {
  key: string
  label: string
  ai: number
  baseline: number
  improvement: number
}

export interface ComparisonView {
  baseline_controller?: 'vac' | 'fixed_timer' | string
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

export function approachOf(laneId: string): Approach {
  return laneId.charAt(0) as Approach
}
