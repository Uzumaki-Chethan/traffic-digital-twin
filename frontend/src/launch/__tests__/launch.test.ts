import { afterEach, describe, expect, it, vi } from 'vitest'
import { DONE, GO, OUT, SET, getPhase, launch, reset } from '../launch'

afterEach(() => {
  reset()
  vi.useRealTimers()
})

describe('get, set, go', () => {
  it('goes red, amber, green, fades, and navigates straight away on red', () => {
    vi.useFakeTimers()
    const go = vi.fn()
    launch(go)
    expect(getPhase()).toBe('get')
    vi.advanceTimersByTime(100)
    expect(go).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(SET - 100)
    expect(getPhase()).toBe('set')
    vi.advanceTimersByTime(GO - SET)
    expect(getPhase()).toBe('go')
    vi.advanceTimersByTime(OUT - GO)
    expect(getPhase()).toBe('out')
    vi.advanceTimersByTime(DONE - OUT)
    expect(getPhase()).toBe('idle')
  })

  it('ignores a second click while it runs', () => {
    vi.useFakeTimers()
    const go = vi.fn()
    launch(go)
    launch(go)
    vi.advanceTimersByTime(DONE)
    expect(go).toHaveBeenCalledTimes(1)
  })
})
