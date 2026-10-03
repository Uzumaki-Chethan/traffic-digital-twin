import { describe, expect, it } from 'vitest'
import { lampFor } from '../lampClock'

describe('the decorative lamps', () => {
  it('are stable for one glyph within a beat', () => {
    expect(lampFor(':r1:', 100)).toBe(lampFor(':r1:', 100))
  })

  it('use all three colours, and change between beats', () => {
    const seen = new Set<string>()
    let changed = 0
    for (let beat = 0; beat < 60; beat++) {
      const a = lampFor(':r7:', beat)
      seen.add(a)
      if (a !== lampFor(':r7:', beat + 1)) changed++
    }
    expect(seen).toEqual(new Set(['red', 'amber', 'green']))
    expect(changed).toBeGreaterThan(20)
  })

  it('differ between glyphs on the same beat', () => {
    const lamps = new Set(Array.from({ length: 12 }, (_, i) => lampFor(`:r${i}:`, 5)))
    expect(lamps.size).toBeGreaterThan(1)
  })
})
