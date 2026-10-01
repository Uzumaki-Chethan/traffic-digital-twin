import type { Gait, Vec } from './types'
import type { Rng } from './brain'

export interface Frame {
  x: number
  y: number
  /** Vertical squash/stretch (1 = rest); horizontal is its inverse root. */
  squash: number
  /** Lean, degrees (positive leans right). */
  tilt: number
  scale: number
  air: boolean
}

export interface Path {
  gait: Gait
  from: Vec
  to: Vec
  duration: number
  at(t: number): Frame
}

export const WALK_SPEED = 70
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const rest = (p: Vec): Frame => ({ x: p.x, y: p.y, squash: 1, tilt: 0, scale: 1, air: false })

/** Time-based paths for every way Blinky gets about (spec §5.2). */
export function makePath(gait: Gait, from: Vec, to: Vec, rng: Rng): Path {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const d = Math.hypot(dx, dy)
  const dir = Math.sign(dx) || 1
  const make = (duration: number, f: (u: number, t: number) => Frame): Path => ({
    gait,
    from,
    to,
    duration,
    at: (t) => (t >= duration ? rest(to) : f(clamp(t / duration, 0, 1), t)),
  })
  switch (gait) {
    case 'walk': {
      const dur = Math.max(0.3, Math.abs(dx) / WALK_SPEED)
      return make(dur, (u, t) => ({
        x: lerp(from.x, to.x, u),
        y: lerp(from.y, to.y, u),
        squash: 1 + 0.05 * Math.sin(t * 16),
        tilt: 6 * Math.sin(t * 16),
        scale: 1,
        air: false,
      }))
    }
    case 'hop': {
      const dur = 0.5 + clamp(d / 1000, 0.1, 0.6)
      const h = Math.max(60, 0.3 * Math.abs(dx), 50 + Math.max(0, from.y - to.y))
      return make(dur, (u) => {
        const squash = u < 0.12 ? 1 - 0.25 * (u / 0.12) : u < 0.3 ? 1.15 : u > 0.92 ? 0.82 : 1
        return {
          x: lerp(from.x, to.x, u),
          y: lerp(from.y, to.y, u) - h * 4 * u * (1 - u),
          squash,
          tilt: dir * 8 * Math.sin(Math.PI * u),
          scale: 1,
          air: u > 0.12 && u < 0.92,
        }
      })
    }
    case 'fly': {
      const dur = 0.8 + d / 280
      const c1 = { x: from.x + dx * 0.25, y: Math.min(from.y, to.y) - 140 }
      const c2 = { x: to.x - dx * 0.25, y: Math.min(from.y, to.y) - 140 }
      const phase = rng() * Math.PI * 2
      return make(dur, (u, t) => {
        const k = easeInOut(u)
        const m = 1 - k
        const x = m * m * m * from.x + 3 * m * m * k * c1.x + 3 * m * k * k * c2.x + k * k * k * to.x
        const y = m * m * m * from.y + 3 * m * m * k * c1.y + 3 * m * k * k * c2.y + k * k * k * to.y
        const bob = 6 * Math.sin(t * 6 + phase) * Math.sin(Math.PI * u)
        return { x, y: y + bob, squash: 1, tilt: clamp(dx / 20, -14, 14) * Math.sin(Math.PI * u), scale: 1, air: true }
      })
    }
    case 'teleport':
      return make(0.9, (u) => {
        if (u < 0.4) return { ...rest(from), scale: 1 - u / 0.4 }
        if (u < 0.5) return { ...rest(to), scale: 0 }
        const k = (u - 0.5) / 0.5
        return { ...rest(to), scale: k < 0.7 ? lerp(0, 1.15, k / 0.7) : lerp(1.15, 1, (k - 0.7) / 0.3) }
      })
    case 'fall': {
      const g = 1800
      const dur = Math.max(0.2, Math.sqrt((2 * Math.max(1, Math.abs(dy))) / g))
      return make(dur, (u) => ({
        x: lerp(from.x, to.x, u),
        y: lerp(from.y, to.y, u * u),
        squash: u > 0.9 ? 0.8 : 1.08,
        tilt: 10 * Math.sin(u * 20),
        scale: 1,
        air: true,
      }))
    }
    case 'slide': {
      const dur = Math.max(0.6, Math.abs(dy) / 500)
      return make(dur, (u) => ({ x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u * u), squash: 0.92, tilt: -6, scale: 1, air: true }))
    }
  }
}
