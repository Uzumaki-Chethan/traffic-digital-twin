import { describe, expect, it } from 'vitest'
import { verdictFor } from '../verdict'

describe('verdictFor', () => {
  it('calls anything inside half a percent even', () => {
    expect(verdictFor(0.3)).toEqual({ side: 'even', pct: 0, label: 'Even', short: 'Even' })
    expect(verdictFor(-0.49)).toEqual({ side: 'even', pct: 0, label: 'Even', short: 'Even' })
    expect(verdictFor(0)).toEqual({ side: 'even', pct: 0, label: 'Even', short: 'Even' })
  })
  it('names Trinetra when the improvement is positive', () => {
    expect(verdictFor(62.5)).toEqual({
      side: 'trinetra',
      pct: 62.5,
      label: 'Trinetra ahead 62.5 %',
      short: 'Trinetra +62.5%',
    })
  })
  it('keeps the badge form short enough for a panel header', () => {
    expect(verdictFor(21.8).short.length).toBeLessThanOrEqual(16)
    expect(verdictFor(-11.8).short.length).toBeLessThanOrEqual(16)
  })
  it('names VAC when the improvement is negative', () => {
    expect(verdictFor(-3.12)).toEqual({
      side: 'vac',
      pct: 3.12,
      label: 'VAC ahead 3.1 %',
      short: 'VAC +3.1%',
    })
  })
})
