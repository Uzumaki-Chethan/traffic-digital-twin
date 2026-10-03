import { afterEach, describe, expect, it, vi } from 'vitest'
import { DONE, GIVE_UP, GO, OUT, SET, arrived, getPhase, launch, reset } from '../launch'

afterEach(() => {
  reset()
  vi.useRealTimers()
})

describe('get, set, go', () => {
  it('goes red, amber, green, and navigates straight away on red', () => {
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
  })

  it('fades after the green when the console is already on screen', () => {
    vi.useFakeTimers()
    launch(() => arrived())
    vi.advanceTimersByTime(OUT)
    expect(getPhase()).toBe('out')
    vi.advanceTimersByTime(DONE - OUT)
    expect(getPhase()).toBe('idle')
  })

  it('holds on green until a slow console arrives, never showing the page behind', () => {
    vi.useFakeTimers()
    launch(() => {})
    vi.advanceTimersByTime(OUT + 3000)
    expect(getPhase()).toBe('go')
    arrived()
    expect(getPhase()).toBe('out')
    vi.advanceTimersByTime(DONE - OUT)
    expect(getPhase()).toBe('idle')
  })

  it('gives up waiting eventually', () => {
    vi.useFakeTimers()
    launch(() => {})
    vi.advanceTimersByTime(GIVE_UP + DONE)
    expect(getPhase()).toBe('idle')
  })

  it('ignores a second click while it runs', () => {
    vi.useFakeTimers()
    const go = vi.fn()
    launch(go)
    launch(go)
    vi.advanceTimersByTime(100)
    expect(go).toHaveBeenCalledTimes(1)
  })
})
