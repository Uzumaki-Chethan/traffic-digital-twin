import { describe, expect, it, vi } from 'vitest'
import { EMPTY_FACTS } from '../catalogue'
import { Director, REST_SIZE, type Ctx } from '../director'

// The director touches window for sizes and timers; give the node env a
// stand-in before any import runs.
vi.hoisted(() => {
  ;(globalThis as unknown as { window: unknown }).window = { innerWidth: 1600, innerHeight: 900, setTimeout, clearTimeout }
})

const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top })
const fakeEl = (r: ReturnType<typeof rect>) => ({ isConnected: true, getBoundingClientRect: () => r }) as unknown as Element

function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    now: 1,
    dt: 0.016,
    world: { platforms: [], elementOf: new Map(), offsetOf: new Map(), main: { left: 300, top: 100, right: 1500, bottom: 850 }, twinPerch: null },
    live: { run: { running: false, paused: false, speed: 1, kind: null }, scenario: '', switchedSeq: 0, emergency: false, queued: 0, facts: EMPTY_FACTS },
    route: '/',
    pointer: null,
    idleSeconds: 0,
    docked: false,
    sound: false,
    reducedMotion: false,
    dock: { x: 50, y: 700 },
    ...over,
  }
}
const ui = () => ({ setSize: vi.fn(), say: vi.fn(), openExplain: vi.fn() })
type Internals = { ctx: Ctx; docked: boolean; path: unknown; queue: { t: string }[]; arrive(id: string): void; followAnchor(): void; brain: { state: string } }

describe('Director', () => {
  it('lands at the platform height recorded with the platform, even if the card scrolled since the read', () => {
    const d = new Director(ui())
    const i = d as unknown as Internals
    // Read when the card top was at 154 (platform 46 px below it); the card has since scrolled to 100.
    const c = ctx()
    c.world.platforms = [{ id: 'c1~h#0', kind: 'card', x1: 400, x2: 800, y: 200 }]
    c.world.elementOf.set('c1~h#0', fakeEl(rect(380, 100, 820, 400)))
    c.world.offsetOf.set('c1~h#0', 46)
    i.ctx = c
    d.pos = { x: 500, y: 200 }
    i.arrive('c1~h#0')
    expect(d.pos.y).toBe(146)
    i.followAnchor()
    expect(d.pos.y).toBe(146)
  })

  it('explains from the dock when shushed: no flight, no growing, no re-docking teleport after', () => {
    const u = ui()
    const d = new Director(u)
    const i = d as unknown as Internals
    i.ctx = ctx({ docked: true })
    i.docked = true
    i.brain.state = 'docked'
    d.pos = { x: 50, y: 700 }
    const ok = d.present({ id: 'page:/', el: fakeEl(rect(0, 0, 10, 10)) }, 1)
    expect(ok).toBe(true)
    expect(u.openExplain).toHaveBeenCalledTimes(1)
    expect(i.path).toBeNull()
    expect(d.size).toBe(REST_SIZE)
    expect(d.pos).toEqual({ x: 50, y: 700 })
    d.endPresent()
    expect(i.path).toBeNull()
    expect(i.queue.some((s) => s.t === 'move')).toBe(false)
    expect(i.brain.state).toBe('docked')
    d.grabAntenna()
    d.dropAntenna(null, 2)
    expect(i.brain.state).toBe('docked')
    expect(i.queue.some((s) => s.t === 'move')).toBe(false)
  })
})
