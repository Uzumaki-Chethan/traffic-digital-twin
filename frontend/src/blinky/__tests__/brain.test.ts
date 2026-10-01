import { describe, expect, it } from 'vitest'
import { Brain, CHEER_GAP_S, SLEEP_AFTER_S, mulberry32 } from '../brain'
import type { Platform, WorldSnapshot } from '../types'

const P = (id: string, y = 300): Platform => ({ id, kind: 'card', x1: 100, x2: 500, y })

function snap(over: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    now: 10,
    self: { x: 200, y: 300 },
    platforms: [P('a'), P('b', 500)],
    pointer: null,
    idleSeconds: 0,
    route: '/',
    run: { running: false, paused: false, speed: 1, kind: null },
    scenario: 'balanced_seed1',
    switched: false,
    emergency: false,
    queued: 0,
    docked: false,
    reducedMotion: false,
    twinPerch: P('twin', 120),
    rideable: false,
    ...over,
  }
}
const RUN = { running: true, paused: false, speed: 1, kind: 'demo' as const }

describe('Brain', () => {
  it('docks once when asked, and stays docked', () => {
    const b = new Brain(mulberry32(1))
    expect(b.next(snap({ docked: true }), false)).toEqual([{ kind: 'dock' }])
    expect(b.next(snap({ docked: true, now: 99, run: RUN }), false)).toEqual([])
    expect(b.state).toBe('docked')
  })

  it('reduced motion docks it too', () => {
    const b = new Brain(mulberry32(1))
    expect(b.next(snap({ reducedMotion: true }), false)).toEqual([{ kind: 'dock' }])
  })

  it('wakes from the dock when un-docked', () => {
    const b = new Brain(mulberry32(1))
    b.next(snap({ docked: true }), false)
    expect(b.next(snap({ docked: false }), false)[0]).toEqual({ kind: 'wake' })
    expect(b.state).toBe('roaming')
  })

  it('flies to the twin perch when a run starts', () => {
    const b = new Brain(mulberry32(2))
    b.next(snap(), false)
    const out = b.next(snap({ now: 11, run: RUN }), false)
    expect(out[0]).toMatchObject({ kind: 'say', text: 'Here we go!' })
    expect(out[1]).toMatchObject({ kind: 'move', gait: 'fly', platformId: 'twin' })
    expect(b.state).toBe('perched')
  })

  it('falls asleep after a minute idle, and wakes when the pointer comes near', () => {
    const b = new Brain(mulberry32(3))
    b.next(snap(), false)
    expect(b.next(snap({ now: 80, idleSeconds: SLEEP_AFTER_S }), false)).toEqual([{ kind: 'sleep' }])
    expect(b.next(snap({ now: 81, idleSeconds: 61, pointer: { x: 900, y: 900 } }), false)).toEqual([])
    const out = b.next(snap({ now: 82, idleSeconds: 0, pointer: { x: 220, y: 310 } }), false)
    expect(out[0]).toEqual({ kind: 'wake' })
  })

  it('cheers on a phase switch, at most once per CHEER_GAP_S', () => {
    const b = new Brain(mulberry32(4))
    b.next(snap({ run: RUN }), false)
    expect(b.next(snap({ now: 20, run: RUN, switched: true }), true)[0]).toMatchObject({ kind: 'emote', anim: 'cheer' })
    expect(b.next(snap({ now: 20 + CHEER_GAP_S - 1, run: RUN, switched: true }), true)).toEqual([])
    expect(b.next(snap({ now: 20 + CHEER_GAP_S + 1, run: RUN, switched: true }), true)[0]).toMatchObject({ anim: 'cheer' })
  })

  it('is silent while presenting — run starts and switches do not interrupt an explanation', () => {
    const b = new Brain(mulberry32(5))
    b.next(snap(), false)
    b.set('presenting')
    expect(b.next(snap({ now: 30, run: RUN, switched: true, emergency: true }), false)).toEqual([])
  })

  it('waits for its next scheduled activity', () => {
    const b = new Brain(mulberry32(6))
    expect(b.next(snap({ now: 10 }), false).length).toBeGreaterThan(0)
    expect(b.next(snap({ now: 11 }), false)).toEqual([])
  })

  it('never chooses a ride unless the map is rideable during a run', () => {
    for (let seed = 1; seed < 200; seed++) {
      const b = new Brain(mulberry32(seed))
      b.next(snap({ run: RUN }), false)
      const out = b.next(snap({ now: 1000, run: RUN, rideable: false }), false)
      expect(out.some((i) => i.kind === 'ride')).toBe(false)
    }
  })

  it('changes page by teleporting to the topmost platform', () => {
    const b = new Brain(mulberry32(7))
    b.next(snap(), false)
    const out = b.next(snap({ now: 12, route: '/analytics', platforms: [P('low', 600), P('top', 140)] }), false)
    expect(out[0]).toMatchObject({ kind: 'move', gait: 'teleport', platformId: 'top' })
  })
})
