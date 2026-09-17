/**
 * Typed clients for the backend endpoints the UI actually calls: the
 * model's training metadata (Overview's prediction panel) and the
 * run-scoped decision log (the Decisions page). Every shape was verified
 * against a live server, not transcribed from a document; where the
 * backend does not carry a field, it is absent here too.
 *
 * The backend also serves /api/logs/performance, /api/logs/predictions,
 * /api/analytics/* and /api/results; nothing in the UI reads them today
 * (Analytics reads the live stream by instruction — data/liveHistory.ts),
 * so they have no client here. Add one when a page needs it.
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

export interface DecisionLogRow {
  id: number
  time: number
  phase: string
  duration: number
  mode: string
  reason: string
  actual_phase: string | null
  actual_is_yellow: boolean | null
  run_id: string | null
  phase_scores: Record<string, number> | null
  margin: number | null
  scenario: string | null
}

/** A run the database holds (`/api/logs/runs`), summarised from its decisions. */
export interface RunSummary {
  /** The run's ISO UTC start time — also its id. */
  run_id: string
  decisions: number
  first_time: number
  last_time: number
  scenario: string | null
  /** Ticks on which the phase changed (duration 0). */
  switches: number
}

export const api = {
  modelInfo: (signal?: AbortSignal) => getJson<ModelInfo | Record<string, never>>('/api/model-info', signal),
  /** One run's decisions, newest first; or with `afterId`, only rows newer than it, oldest first. */
  decisionLogs: (limit = 200, run?: string, afterId?: number, signal?: AbortSignal) =>
    getJson<DecisionLogRow[]>(
      `/api/logs/decisions?limit=${limit}` +
        (run ? `&run=${encodeURIComponent(run)}` : '') +
        (afterId != null ? `&after_id=${afterId}` : ''),
      signal,
    ),
  runs: (signal?: AbortSignal) => getJson<RunSummary[]>('/api/logs/runs', signal),
}

export function hasModelInfo(m: ModelInfo | Record<string, never> | null): m is ModelInfo {
  return !!m && 'model_type' in m
}
