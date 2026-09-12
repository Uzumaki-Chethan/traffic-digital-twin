/**
 * Typed clients for the backend's read-only history endpoints.
 *
 * Every shape below was verified against a live server reading the real
 * recorded database (2026-09-12) — not transcribed from a document. Where
 * the backend does not carry a field, it is absent here too; nothing is
 * invented to fill a gap.
 */

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal })
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
  return (await res.json()) as T
}

/** Training metadata, straight from the model's own metadata.json.
 * Static — it changes only when the model is retrained. */
export interface ModelInfo {
  trained_at_utc: string
  sklearn_version: string
  model_type: string
  n_estimators: number
  prediction_horizon_seconds: number
  feature_vector_length: number
  target_vector_length: number
  scenarios_used: string[]
  held_out_scenario: string
  training_row_count: number
  test_row_count: number
  held_out_row_count: number
  /** overall/vehicle/wait MAE plus a per-lane `<lane>_mae` for all 12 lanes. */
  test_metrics: Record<string, number>
  held_out_metrics: Record<string, number>
}

/**
 * One evaluated prediction. NOTE: the table has no lane_id column
 * (verified against the schema), so a row cannot be attributed to a
 * lane — these are usable for aggregate accuracy over time only. Live
 * per-lane pairs come from the snapshot's `prediction.rows` instead.
 */
export interface PredictionLogRow {
  id: number
  time: number
  predicted_values: { vehicle_count: number; average_waiting_time: number }
  actual_values: { vehicle_count: number; average_waiting_time: number }
  confidence: number
}

export interface DecisionLogRow {
  id: number
  time: number
  phase: string
  duration: number
  mode: string
  reason: string
}

export interface PerformanceLogRow {
  id: number
  time: number
  avg_wait: number
  avg_speed: number
  queue_length: number
  stopped: number
}

export interface LaneWaitTimes {
  group_by: 'lane'
  lanes: Record<string, { average_wait_seconds: number; sample_count: number }>
}

export interface CongestionBucket {
  bucket_start: number
  bucket_end: number
  avg_congestion_score: number
  sample_count: number
}

/** Same endpoint with group_by=lane: one row per (bucket, lane) pair. */
export interface CongestionLaneBucket extends CongestionBucket {
  lane_id: string
}

export interface PeakPeriod {
  start_time: number
  end_time: number
  peak_congestion_score: number
  sample_count: number
  scenario: string | null
}

/** A saved evaluator run, parsed from results/*.csv. `improvement_pct` is
 * already signed — positive is better, direction accounted for. */
export interface ResultsSummary {
  scenario: string
  rows: { metric: string; ai: number; baseline: number; improvement_pct: number }[]
}

export const api = {
  modelInfo: (signal?: AbortSignal) => getJson<ModelInfo | Record<string, never>>('/api/model-info', signal),
  predictionLogs: (limit = 200, signal?: AbortSignal) => getJson<PredictionLogRow[]>(`/api/logs/predictions?limit=${limit}`, signal),
  decisionLogs: (limit = 200, signal?: AbortSignal) => getJson<DecisionLogRow[]>(`/api/logs/decisions?limit=${limit}`, signal),
  performanceLogs: (limit = 200, signal?: AbortSignal) => getJson<PerformanceLogRow[]>(`/api/logs/performance?limit=${limit}`, signal),
  laneWaitTimes: (signal?: AbortSignal) => getJson<LaneWaitTimes>('/api/analytics/wait-times?group_by=lane', signal),
  congestionTrend: (bucketSeconds = 60, signal?: AbortSignal) => getJson<CongestionBucket[]>(`/api/analytics/congestion-trend?bucket_seconds=${bucketSeconds}`, signal),
  congestionByLane: (bucketSeconds = 60, signal?: AbortSignal) => getJson<CongestionLaneBucket[]>(`/api/analytics/congestion-trend?bucket_seconds=${bucketSeconds}&group_by=lane`, signal),
  networkWaitTime: (signal?: AbortSignal) => getJson<{ group_by: 'network'; average_wait_seconds: number | null; sample_count: number }>('/api/analytics/wait-times?group_by=network', signal),
  peakPeriods: (topN = 5, signal?: AbortSignal) => getJson<PeakPeriod[]>(`/api/analytics/peak-periods?top_n=${topN}`, signal),
  results: (signal?: AbortSignal) => getJson<ResultsSummary[]>('/api/results', signal),
}

export function hasModelInfo(m: ModelInfo | Record<string, never> | null): m is ModelInfo {
  return !!m && 'model_type' in m
}
