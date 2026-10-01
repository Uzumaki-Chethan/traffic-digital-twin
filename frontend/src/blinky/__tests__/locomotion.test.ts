import { describe, expect, it } from 'vitest'
import { makePath } from '../locomotion'
import { mulberry32 } from '../brain'

const rng = mulberry32(9)
const A = { x: 100, y: 400 }
const B = { x: 500, y: 300 }

describe('makePath', () => {
  for (const gait of ['walk', 'hop', 'fly', 'teleport', 'fall', 'slide'] as const) {
    it(`${gait}: positive duration, starts at A, ends exactly at B, upright at rest`, () => {
      const p = makePath(gait, A, B, rng)
      expect(p.duration).toBeGreaterThan(0)
      const end = p.at(p.duration + 1)
      expect(end.x).toBeCloseTo(B.x, 5)
      expect(end.y).toBeCloseTo(B.y, 5)
      expect(end.scale).toBeCloseTo(1, 5)
      if (gait !== 'teleport') {
        const start = p.at(0)
        expect(start.x).toBeCloseTo(A.x, 5)
        expect(start.y).toBeCloseTo(A.y, 5)
      }
    })
  }
  it('a hop arcs above both ends', () => {
    const p = makePath('hop', A, B, rng)
    const mid = p.at(p.duration / 2)
    expect(mid.y).toBeLessThan(Math.min(A.y, B.y))
    expect(mid.air).toBe(true)
  })
  it('a teleport vanishes in the middle', () => {
    const p = makePath('teleport', A, B, rng)
    expect(p.at(p.duration * 0.45).scale).toBe(0)
  })
})
