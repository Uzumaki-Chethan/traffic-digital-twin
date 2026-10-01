import type { Anim, Gait, Intent, Mood, Platform, PrankId, Prop, Vec, WorldSnapshot } from './types'

export type Rng = () => number

/** Small, fast, seedable PRNG — the brain is deterministic under test. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}

export function between(rng: Rng, a: number, b: number): number {
  return a + (b - a) * rng()
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)

export const SLEEP_AFTER_S = 60
export const WAKE_RADIUS_PX = 250
export const CHEER_GAP_S = 4
export const DANCE_GAP_S = 25

export const ARRIVE = ['Ooh, a new page!', 'Hello again!', 'What’s over here?', 'Ta-da!'] as const

export type BrainState = 'docked' | 'roaming' | 'perched' | 'sleeping' | 'presenting' | 'held' | 'riding'

const say = (text: string, mood: Mood, ms = 2600): Intent => ({ kind: 'say', text, mood, ms })
const emote = (anim: Anim, mood: Mood, ms: number, prop: Prop = null): Intent => ({ kind: 'emote', anim, mood, ms, prop })

/** A point on a platform, kept a little in from its ends. */
export function pointOn(p: Platform, rng: Rng): Vec {
  const pad = Math.min(24, (p.x2 - p.x1) / 4)
  return { x: between(rng, p.x1 + pad, p.x2 - pad), y: p.y }
}

export function pickPlatform(ps: Platform[], rng: Rng, avoid?: string | null): Platform | null {
  const others = ps.filter((p) => p.id !== avoid)
  const pool = others.length ? others : ps
  return pool.length ? pick(rng, pool) : null
}

export function topPlatform(ps: Platform[]): Platform | null {
  return ps.reduce<Platform | null>((best, p) => (best === null || p.y < best.y ? p : best), null)
}

const IDLE_PRANKS: PrankId[] = ['peekaboo', 'tug', 'note', 'cop', 'lever', 'slide', 'lift', 'hide']

/**
 * Blinky's brain: given what's happening (WorldSnapshot) and whether its
 * body is still busy with the last thing, decide what to do next. Pure and
 * seeded, so every rule here has a test. BlinkyRoot owns the body and calls
 * `set()` for the states it drives from outside (held, presenting, riding).
 */
export class Brain {
  state: BrainState = 'roaming'
  platformId: string | null = null
  private nextAt = 0
  private prev: { running: boolean; paused: boolean; emergency: boolean; route: string } | null = null
  private lastCheer = -Infinity
  private lastDance = -Infinity

  constructor(private rng: Rng) {}

  set(state: BrainState): void {
    this.state = state
  }

  private gap(w: WorldSnapshot): number {
    return w.run.running ? between(this.rng, 30, 60) : between(this.rng, 20, 40)
  }

  next(w: WorldSnapshot, busy: boolean): Intent[] {
    const prev = this.prev
    this.prev = { running: w.run.running, paused: w.run.paused, emergency: w.emergency, route: w.route }

    if (this.state === 'held' || this.state === 'presenting') return []

    if (w.docked || w.reducedMotion) {
      if (this.state === 'docked') return []
      this.state = 'docked'
      return [{ kind: 'dock' }]
    }
    if (this.state === 'docked') {
      this.state = 'roaming'
      this.nextAt = w.now + 1.5
      return [{ kind: 'wake' }]
    }

    if (this.state === 'sleeping') {
      const near = w.pointer !== null && dist(w.pointer, w.self) < WAKE_RADIUS_PX
      const started = prev !== null && !prev.running && w.run.running
      if (!near && !started) return []
      this.state = 'roaming'
      this.nextAt = w.now + 3
      return [{ kind: 'wake' }, say('Mmh? I’m up, I’m up!', 'curious', 1800)]
    }

    if (prev) {
      if (w.route !== prev.route) {
        this.nextAt = w.now + this.gap(w)
        const top = topPlatform(w.platforms)
        const out: Intent[] = []
        if (top) {
          out.push({ kind: 'move', gait: 'teleport', to: { x: top.x1 + Math.min(60, (top.x2 - top.x1) / 3), y: top.y }, platformId: top.id })
          this.platformId = top.id
        }
        out.push(say(pick(this.rng, ARRIVE), 'happy', 2000), emote('wave', 'happy', 1200))
        return out
      }
      if (w.run.running && !prev.running) {
        this.state = 'perched'
        this.nextAt = w.now + this.gap(w)
        const out: Intent[] = [say('Here we go!', 'happy', 2000)]
        if (w.twinPerch) {
          out.push({ kind: 'move', gait: 'fly', to: pointOn(w.twinPerch, this.rng), platformId: w.twinPerch.id })
          this.platformId = w.twinPerch.id
        }
        return out
      }
      if (!w.run.running && prev.running) {
        this.state = 'roaming'
        return [emote('wave', 'happy', 1200), say('That was fun!', 'happy', 2000)]
      }
      if (w.run.paused && !prev.paused) return [emote('confused', 'curious', 2400)]
      if (w.emergency && !prev.emergency) {
        return [emote('salute', 'curious', 3000, 'siren'), say('Make way, emergency!', 'curious', 2400)]
      }
    }

    if (this.state === 'riding') return []

    if (w.idleSeconds >= SLEEP_AFTER_S && !busy) {
      this.state = 'sleeping'
      return [{ kind: 'sleep' }]
    }
    if (w.switched && w.run.running && w.now - this.lastCheer > CHEER_GAP_S) {
      this.lastCheer = w.now
      return [emote('cheer', 'happy', 900)]
    }
    if (w.run.running && w.run.speed === null && !busy && w.now - this.lastDance > DANCE_GAP_S) {
      this.lastDance = w.now
      return [emote('dance', 'disco', 3200, 'shades'), say('Wheee!', 'disco', 1800)]
    }

    if (busy || w.now < this.nextAt) return []
    this.nextAt = w.now + this.gap(w)
    return this.activity(w)
  }

  private activity(w: WorldSnapshot): Intent[] {
    const running = w.run.running
    const table: [number, () => Intent[]][] = [
      [running ? 1 : 3, () => this.moveTo('walk', w, true)],
      [2, () => this.moveTo('hop', w, false)],
      [2, () => this.moveTo('fly', w, false)],
      [1, () => this.moveTo('teleport', w, false)],
      [running ? 3 : 2, () => this.trick(w)],
      [running ? 0.6 : 1.6, () => [{ kind: 'prank', id: pick(this.rng, IDLE_PRANKS) }]],
      [
        running && w.rideable ? 1.6 : 0,
        () => {
          this.state = 'riding'
          return [{ kind: 'ride' }]
        },
      ],
    ]
    const total = table.reduce((s, [wt]) => s + wt, 0)
    let r = this.rng() * total
    for (const [wt, act] of table) {
      if (wt <= 0) continue
      r -= wt
      if (r <= 0) return act()
    }
    return this.trick(w)
  }

  private moveTo(gait: Gait, w: WorldSnapshot, samePlatform: boolean): Intent[] {
    const here = w.platforms.find((p) => p.id === this.platformId) ?? null
    const target = samePlatform && here ? here : pickPlatform(w.platforms, this.rng, samePlatform ? null : this.platformId)
    if (!target) return this.trick(w)
    this.platformId = target.id
    return [{ kind: 'move', gait, to: pointOn(target, this.rng), platformId: target.id }]
  }

  private trick(w: WorldSnapshot): Intent[] {
    const s = w.scenario
    if (w.run.running && s.startsWith('rain')) return [emote('look', 'curious', 3000, 'umbrella')]
    if (w.run.running && s.startsWith('accident')) {
      return [emote('worried', 'sad', 2600), say('Oh no, a crash on that lane…', 'sad')]
    }
    if (w.run.running && w.queued >= 25) return [emote('fan', 'sad', 2800, 'fan'), say('Phew, busy out there!', 'sad', 2000)]
    const anim = pick(this.rng, ['wave', 'stretch', 'look', 'blush', 'shrug'] as const)
    return [emote(anim, anim === 'look' ? 'curious' : 'happy', 1600)]
  }
}
