/**
 * Shapes returned by the new read-only history endpoints added to
 * backend/services/dashboard_server.py (GET /api/logs/*, GET /api/results).
 * These read straight from db_logger.py's SQLite tables / the evaluator's
 * results/*.csv files - see that file's docstring for the "pure viewer,
 * read-only" rule these endpoints were written to respect.
 */

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

export interface PredictionLogRow {
  id: number
  time: number
  predicted_values: { vehicle_count: number; average_waiting_time: number }
  actual_values: { vehicle_count: number; average_waiting_time: number }
  confidence: number
}

export interface ResultsSummary {
  scenario: string
  rows: { metric: string; ai: number; baseline: number; improvement_pct: number }[]
}

/**
 * Verbatim shape of backend/ml/trained_models/random_forest_predictor.metadata.json,
 * served as-is by GET /api/model-info. Static training-time metadata,
 * not runtime state - only changes when the model is retrained.
 */
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
  test_metrics: { overall_mae: number; vehicle_count_mae: number; average_waiting_time_mae: number }
  held_out_metrics: { overall_mae: number; vehicle_count_mae: number; average_waiting_time_mae: number }
}
