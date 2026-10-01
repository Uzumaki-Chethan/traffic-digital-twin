import { describe, expect, it, vi } from 'vitest'

const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })

describe('chirp', () => {
  it('resumes a suspended audio context (created before any user gesture, e.g. after a reload with Sound on)', async () => {
    const resume = vi.fn(() => Promise.resolve())
    class FakeCtx {
      state = 'suspended'
      currentTime = 0
      destination = {}
      resume = resume
      createOscillator() {
        return { type: 'sine', frequency: param(), connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() }
      }
      createGain() {
        return { gain: param(), connect: (n: unknown) => n }
      }
    }
    ;(globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeCtx
    const { chirp } = await import('../sound')
    chirp('hi', true)
    expect(resume).toHaveBeenCalled()
  })
})
