import { describe, expect, it } from 'vitest'
import { EVAL_SCENARIOS } from '@/data/scenarios'
import { HEADLINES, PIPELINE, PREDICTION, RESULTS, SCENARIO_GROUPS } from '../content'

describe('home page content', () => {
  it('every scenario in the library appears in exactly one group', () => {
    const grouped = SCENARIO_GROUPS.flatMap((g) => g.ids)
    expect(grouped.toSorted()).toEqual(EVAL_SCENARIOS.map((s) => s.id).toSorted())
    expect(new Set(grouped).size).toBe(grouped.length)
  })

  it('results are the README sweep (vs VAC, seed 1): one row per scenario, real numbers', () => {
    expect(RESULTS).toHaveLength(13)
    const ids = new Set(EVAL_SCENARIOS.map((s) => s.id))
    for (const r of RESULTS) expect(ids.has(r.id)).toBe(true)
    expect(RESULTS.find((r) => r.id === 'normal_traffic_seed1')?.wait).toBe(86.2)
    expect(RESULTS.find((r) => r.id === 'light_seed1')?.wait).toBe(7.1)
    expect(RESULTS.every((r) => r.wins === 7)).toBe(true)
  })

  it('headline claims are computed from the data, never typed in', () => {
    expect(HEADLINES.scenariosWon).toBe(13)
    expect(HEADLINES.bestWaitCut).toBe(Math.max(...RESULTS.map((r) => r.wait)))
    expect(PREDICTION.betterThanGuessPct).toBe(Math.round(((PREDICTION.persistenceMae - PREDICTION.modelMae) / PREDICTION.persistenceMae) * 100))
    expect(PREDICTION.betterThanGuessPct).toBe(47)
  })

  it('the pipeline runs from the simulator to the signal', () => {
    expect(PIPELINE[0].key).toBe('sim')
    expect(PIPELINE.at(-1)?.key).toBe('signal')
  })
})
