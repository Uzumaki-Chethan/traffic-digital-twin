import { describe, expect, it } from 'vitest'
import { BLINKY_CLEARANCE, nearestPlatform, platformUnder, platformsFrom } from '../world'

const view = { left: 300, top: 100, right: 1300, bottom: 900 }
const box = (id: string, left: number, top: number, right: number, bottom: number) => ({ id, left, top, right, bottom })

describe('platformsFrom', () => {
  it('turns a lone card top into one platform, inset 16 px', () => {
    expect(platformsFrom([box('a', 400, 300, 800, 500)], view)).toEqual([{ id: 'a#0', kind: 'card', x1: 416, x2: 784, y: 300 }])
  })
  it('cuts out the part with a card right above it (no clearance)', () => {
    const ps = platformsFrom([box('a', 400, 300, 1000, 500), box('b', 400, 120, 600, 300 - BLINKY_CLEARANCE + 10)], view)
    expect(ps.filter((p) => p.id.startsWith('a'))).toEqual([{ id: 'a#0', kind: 'card', x1: 620, x2: 984, y: 300 }])
  })
  it('drops slivers narrower than MIN_SEGMENT and cards outside the frame', () => {
    expect(platformsFrom([box('a', 400, 300, 450, 500)], view)).toEqual([])
    expect(platformsFrom([box('a', 400, 120, 800, 500)], view)).toEqual([]) // too close to the frame top
    expect(platformsFrom([box('a', 400, 895, 800, 1200)], view)).toEqual([])
  })
})

describe('platformUnder / nearestPlatform', () => {
  const ps = [
    { id: 'hi', kind: 'card' as const, x1: 400, x2: 800, y: 300 },
    { id: 'lo', kind: 'card' as const, x1: 400, x2: 800, y: 600 },
  ]
  it('finds the first platform below a point', () => {
    expect(platformUnder(ps, { x: 500, y: 200 })?.id).toBe('hi')
    expect(platformUnder(ps, { x: 500, y: 400 })?.id).toBe('lo')
    expect(platformUnder(ps, { x: 100, y: 200 })).toBeNull()
  })
  it('nearestPlatform always answers when there is any', () => {
    expect(nearestPlatform(ps, { x: 100, y: 590 })?.id).toBe('lo')
    expect(nearestPlatform([], { x: 0, y: 0 })).toBeNull()
  })
})
