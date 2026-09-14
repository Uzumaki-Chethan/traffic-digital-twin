import { create } from 'zustand'
import { isEvaluation, type ComparisonRow, type Snapshot } from './types'

/**
 * The evaluation happening now, remembered tick by tick so the
 * Performance page can draw each metric over simulated time. The
 * sibling of liveHistory.ts: one sample per evaluation frame (both
 * controllers' seven cumulative metrics), kept in the browser for the
 * length of the run, never fetched from the database.
 *
 * Re-render control is the same idea as liveHistory: samples are always
 * appended, but the `revision` components subscribe to is bumped at most
 * once a second, so seven charts refresh at a readable cadence at 5x.
 */

export interface EvalSample {
  t: number
  ai: Record<string, number>
  vac: Record<string, number>
}

const CAPACITY = 3600
const REFRESH_MS = 1000

let samples: EvalSample[] = []
let lastT: number | null = null
let lastScenario: string | null = null
let lastBump: number | null = null

interface EvalHistoryState {
  revision: number
  count: number
  /** The last frame said the run is over: verdicts are final. */
  final: boolean
  scenario: string | null
  /** The latest comparison rows, as the evaluator sent them. */
  rows: ComparisonRow[]
}

export const useEvalHistory = create<EvalHistoryState>(() => ({
  revision: 0,
  count: 0,
  final: false,
  scenario: null,
  rows: [],
}))

export function getEvalSamples(): readonly EvalSample[] {
  return samples
}

export function clearEvalHistory(): void {
  samples = []
  lastT = null
  lastScenario = null
  lastBump = null
  useEvalHistory.setState((s) => ({ revision: s.revision + 1, count: 0, final: false, scenario: null, rows: [] }))
}

function publish(force: boolean, patch: Partial<EvalHistoryState>): void {
  const now = performance.now()
  if (!force && lastBump !== null && now - lastBump < REFRESH_MS) return
  lastBump = now
  useEvalHistory.setState((s) => ({ ...patch, revision: s.revision + 1, count: samples.length }))
}

export function pushEvalSample(snapshot: Snapshot): void {
  if (!isEvaluation(snapshot)) return
  const t = snapshot.sim_time
  const scenarioChanged = lastScenario !== null && lastScenario !== snapshot.scenario
  if ((lastT !== null && t < lastT) || scenarioChanged) {
    clearEvalHistory()
  }
  if (lastT !== null && t === lastT && !snapshot.comparison.final) return
  lastT = t
  lastScenario = snapshot.scenario

  const ai: Record<string, number> = {}
  const vac: Record<string, number> = {}
  for (const row of snapshot.comparison.rows) {
    ai[row.key] = row.ai
    vac[row.key] = row.baseline
  }
  if (samples.length === 0 || samples[samples.length - 1].t !== t) {
    samples.push({ t, ai, vac })
    if (samples.length > CAPACITY) samples = samples.slice(samples.length - CAPACITY)
  }

  // A final frame must never be held back by the once-a-second gate: it
  // is the one the verdicts lock on.
  publish(snapshot.comparison.final, {
    final: snapshot.comparison.final,
    scenario: snapshot.scenario,
    rows: snapshot.comparison.rows,
  })
}
