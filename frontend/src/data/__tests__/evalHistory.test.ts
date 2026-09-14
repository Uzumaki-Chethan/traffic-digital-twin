import { beforeEach, describe, expect, it } from 'vitest'
import { clearEvalHistory, getEvalSamples, pushEvalSample, useEvalHistory } from '../evalHistory'
import type { EvaluationSnapshot, SideView, Snapshot } from '../types'

const side: SideView = {
  signal: null,
  metrics: { vehicles: 0, avg_speed: 0, avg_wait: 0, queue: 0, stopped: 0 },
  lanes: [], vehicles: [], phase_history: [],
  decision: { active_phase: 'NS_straight_left', mode: 'priority', switched: false, reason: '', duration: 0, phase_scores: {} },
}

function frame(t: number, ai: number, vac: number, final = false, scenario = 'light_seed1'): EvaluationSnapshot {
  return {
    kind: 'evaluation', sim_time: t, scenario, baseline_controller: 'vac', ai: side, baseline: side,
    comparison: {
      final,
      rows: [
        { key: 'avg_waiting_time_seconds', label: 'Avg Waiting Time (s)', ai, baseline: vac, improvement: ((vac - ai) / vac) * 100 },
        { key: 'throughput_vehicles', label: 'Throughput (veh completed)', ai: 10, baseline: 10, improvement: 0 },
      ],
    },
  }
}

describe('evalHistory', () => {
  beforeEach(() => clearEvalHistory())

  it('keeps one sample per evaluation tick, both sides, keyed by metric', () => {
    pushEvalSample(frame(1, 2, 4))
    pushEvalSample(frame(2, 2.5, 5))
    pushEvalSample(frame(3, 3, 6))
    const s = getEvalSamples()
    expect(s.length).toBe(3)
    expect(s[2]).toEqual({ t: 3, ai: { avg_waiting_time_seconds: 3, throughput_vehicles: 10 }, vac: { avg_waiting_time_seconds: 6, throughput_vehicles: 10 } })
    expect(useEvalHistory.getState().final).toBe(false)
    expect(useEvalHistory.getState().scenario).toBe('light_seed1')
    expect(useEvalHistory.getState().rows[0].improvement).toBe(50)
  })

  it('ignores frames that are not evaluations and repeated ticks', () => {
    pushEvalSample({ status: 'waiting_for_simulation' } as Snapshot)
    pushEvalSample(frame(1, 2, 4))
    pushEvalSample(frame(1, 2, 4))
    expect(getEvalSamples().length).toBe(1)
  })

  it('locks final when the last frame says so', () => {
    pushEvalSample(frame(1, 2, 4))
    pushEvalSample(frame(2, 2, 4, true))
    expect(useEvalHistory.getState().final).toBe(true)
  })

  it('starts over when simulated time runs backwards or the scenario changes', () => {
    pushEvalSample(frame(5, 2, 4))
    pushEvalSample(frame(6, 2, 4))
    pushEvalSample(frame(1, 2, 4))
    expect(getEvalSamples().length).toBe(1)
    pushEvalSample(frame(2, 2, 4, false, 'heavy_seed1'))
    expect(getEvalSamples().length).toBe(1)
    expect(useEvalHistory.getState().scenario).toBe('heavy_seed1')
  })
})
