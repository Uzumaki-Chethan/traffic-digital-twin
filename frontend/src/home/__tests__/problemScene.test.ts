import { describe, expect, it } from 'vitest'
import { lampsAt, waitingAt } from '../ProblemScene'

const steps = Array.from({ length: 201 }, (_, i) => i / 200)

describe('the problem scene', () => {
  it('never shows green both ways at once', () => {
    for (const p of steps) {
      const { ns, ew } = lampsAt(p)
      expect(ns === 'green' && ew === 'green').toBe(false)
    }
  })

  it('goes through amber before the other way gets its green', () => {
    const seq = steps.map((p) => `${lampsAt(p).ew}`)
    const firstAmber = seq.indexOf('amber')
    const firstRed = seq.indexOf('red')
    expect(firstAmber).toBeGreaterThan(0)
    expect(firstRed).toBeGreaterThan(firstAmber)
  })

  it('builds the whole queue on a clock, then clears it with Trinetra', () => {
    expect(waitingAt(0)).toBe(0)
    expect(waitingAt(0.47)).toBe(14)
    expect(waitingAt(1)).toBe(0)
    // nobody leaves while North–South is still red
    for (const p of steps.filter((x) => x < 0.55)) expect(waitingAt(p)).toBeGreaterThanOrEqual(waitingAt(Math.max(0, p - 0.005)))
  })
})
