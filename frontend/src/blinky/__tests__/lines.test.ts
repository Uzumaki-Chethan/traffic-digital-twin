import { describe, expect, it } from 'vitest'
import { FACTS, GREETINGS, JOKES, liveLine } from '../lines'
import { EMPTY_FACTS } from '../catalogue'

describe('lines', () => {
  it('has something to say', () => {
    expect(GREETINGS.length).toBeGreaterThan(1)
    expect(FACTS.length).toBeGreaterThan(3)
    expect(JOKES.length).toBeGreaterThan(2)
  })
  it('reads the live phase in plain words, and stays quiet when idle', () => {
    expect(liveLine(EMPTY_FACTS)).toBeNull()
    const s = liveLine({ ...EMPTY_FACTS, running: true, phase: 'N–S straight + left', held: 12 })
    expect(s).toBe('N–S straight + left has the green — held 12 s.')
  })
})
