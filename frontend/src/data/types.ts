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

/** One real vehicle, from app.py's snapshot. `x`/`y` are SUMO network
 * metres (junction C sits at 200,200; the network is 400 m square) read
 * from traci.vehicle.getPosition(). `lane` may be an inbound lane, an
 * outbound C_out_* lane, or an internal ":C_*" junction lane. */
export interface VehicleView {
  id: string
  lane: string
  x: number
  y: number
  speed: number
  /**
   * SUMO's own type id — `car_normal`, `motorcycle_aggressive`,
   * `auto_rickshaw`, `bus`, `truck`, `ambulance`, … Added to the backend
   * contract 2026-09-13 so the views can draw a bus as a bus. The
   * dimensions that go with each id are in overview/vehicleTypes.ts,
   * transcribed from the frozen vehicle_types.add.xml. Optional: an
   * older backend does not send it, and those vehicles draw as cars.
   */
  type?: string
  /** SUMO's heading, degrees clockwise from north, along the lane's
   * real shape (2026-09-17). Optional on an older backend. */
  angle?: number
}

export interface LaneView {
  lane_id: LaneId | string
  vehicles: number
  avg_wait: number
  /**
   * The lane's 0–1 urgency score, exactly as DecisionEngine computed it
   * this tick (the same number persisted to lane_state_log). Added to the
   * backend contract 2026-09-12 so lane pressure can be charted live
   * instead of read back out of SQLite. Optional: an older backend, or an
   * evaluator-driven snapshot, does not send it.
   */
  score?: number
  signal: SumoSignalChar
}

export interface DecisionView {
  active_phase: PhaseName | string
  mode: DecisionMode | string
  switched: boolean
  reason: string
  duration: number
  phase_scores: Record<string, number>
  /** The effective hysteresis margin this tick: a challenger must score
   * more than the served phase plus this to take the junction by
   * preference. 0 for a baseline (no margin); absent on an older backend. */
  margin?: number
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
  /** Which run this frame belongs to. A demo run says "demo"; an older
   * backend omits it. Evaluation frames are a different shape entirely
   * (EvaluationSnapshot). Added 2026-09-14. */
  kind?: 'demo'
  /** True on a decision tick (1 Hz). False on the motion frames between
   * ticks (every 0.2 s simulated, since 2026-09-16), which carry only
   * fresh vehicle positions and an advanced held-seconds; anything that
   * samples per tick must skip those. An older backend omits it (all
   * ticks). */
  tick?: boolean
  sim_time: number
  signal: SignalView | null
  metrics: MetricsView
  lanes: LaneView[]
  /** Added to the backend contract 2026-09-12 so the plate can draw real
   * traffic. Optional because an evaluator-driven snapshot may omit it. */
  vehicles?: VehicleView[]
  decision: DecisionView
  emergency_lanes: string[]
  prediction: PredictionView | null
  comparison: ComparisonView | null
  phase_history: PhaseHistoryEntry[]
}

export interface WaitingSnapshot {
  status: 'waiting_for_simulation'
}

/** One controller's junction inside an evaluation frame — built by the
 * same backend view builders as a demo snapshot (services/snapshot_views.py),
 * so a JunctionPlate draws it identically. No prediction: the baseline has
 * none, and the Performance page shows the model nowhere. */
export interface SideView {
  signal: SignalView | null
  metrics: MetricsView
  lanes: LaneView[]
  vehicles: VehicleView[]
  decision: DecisionView
  /** Lanes holding an emergency vehicle, as this side's engine was told
   * (the AI's detection; the baseline is never told and sends []).
   * Absent on a backend from before 2026-09-18. */
  emergency_lanes?: string[]
  phase_history: PhaseHistoryEntry[]
}

/** Trinetra vs a baseline on the identical scenario, in lockstep —
 * what performance/evaluator.py publishes when the console runs an
 * evaluation (2026-09-14). `comparison.final` is true on the last frame
 * only, so verdicts can lock. */
export interface EvaluationSnapshot {
  kind: 'evaluation'
  /** As LiveSnapshot.tick. */
  tick?: boolean
  sim_time: number
  scenario: string
  baseline_controller: 'vac' | 'fixed_timer' | string
  ai: SideView
  baseline: SideView
  comparison: { rows: ComparisonRow[]; final: boolean }
}

export type Snapshot = LiveSnapshot | EvaluationSnapshot | WaitingSnapshot

export function isEvaluation(s: Snapshot | null): s is EvaluationSnapshot {
  return s !== null && 'kind' in s && s.kind === 'evaluation'
}
export function isLive(s: Snapshot | null): s is LiveSnapshot {
  return s !== null && 'sim_time' in s && !isEvaluation(s)
}

export function approachOf(laneId: string): Approach {
  return laneId.charAt(0) as Approach
}
