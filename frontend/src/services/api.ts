import type { DecisionLogRow, ModelInfo, PerformanceLogRow, PredictionLogRow, ResultsSummary } from '@/types/logs'

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`${path} -> HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export const api = {
  latest: () => getJson('/api/latest'),
  decisionLogs: (limit = 200) => getJson<DecisionLogRow[]>(`/api/logs/decisions?limit=${limit}`),
  performanceLogs: (limit = 200) => getJson<PerformanceLogRow[]>(`/api/logs/performance?limit=${limit}`),
  predictionLogs: (limit = 200) => getJson<PredictionLogRow[]>(`/api/logs/predictions?limit=${limit}`),
  results: () => getJson<ResultsSummary[]>('/api/results'),
  modelInfo: () => getJson<ModelInfo | Record<string, never>>('/api/model-info'),
}
