import { describe, expect, it } from 'vitest'
import { DisplayClock, LAG_WALL_SECONDS, LANE_CHANGE_SECONDS, MotionBuffer, shortestTurn, type Pose } from '../motion'
import type { VehicleView } from '../types'

const v = (id: string, x: number, y: number, angle: number, extra: Partial<VehicleView> = {}): VehicleView => ({
  id, lane: 'N_in_0', x, y, speed: 5, type: 'car_normal', angle, ...extra,
})

describe('MotionBuffer', () => {
  it('interpolates position and heading between the two frames that bracket the time', () => {
    const b = new MotionBuffer()
    b.push(10.0, [v('a', 0, 0, 350)])
    b.push(10.2, [v('a', 2, 4, 10)])
    const out = new Map<string, Pose>()
    b.sample(10.1, out)
    const p = out.get('a')!
    expect(p.x).toBeCloseTo(1)
    expect(p.y).toBeCloseTo(2)
    // 350° -> 10° is a 20° turn through north, not a 340° spin the other way.
    expect(((p.angle % 360) + 360) % 360).toBeCloseTo(0)
  })

  it('shows a vehicle that just appeared at its first position, and drops one that left', () => {
    const b = new MotionBuffer()
    b.push(1.0, [v('old', 0, 0, 0)])
    b.push(1.2, [v('new', 9, 9, 90)])
    const out = new Map<string, Pose>()
    b.sample(1.1, out)
    expect(out.has('old')).toBe(false)
    expect(out.get('new')?.x).toBe(9)
    expect(b.ids().toSorted()).toEqual(['new', 'old'])
    expect(b.typeOf('old')).toBe('car_normal')
  })

  it('never extrapolates past the newest frame, and starts over when time runs backwards', () => {
    const b = new MotionBuffer()
    b.push(5.0, [v('a', 0, 0, 0)])
    b.push(5.2, [v('a', 2, 0, 0)])
    const out = new Map<string, Pose>()
    b.sample(9.0, out)
    expect(out.get('a')?.x).toBe(2)
    b.push(0.05, [v('z', 1, 1, 0)]) // a new run
    expect(b.oldestT).toBe(0.05)
    expect(b.ids()).toEqual(['z'])
  })

  it('turns the short way round', () => {
    expect(shortestTurn(350, 10)).toBe(20)
    expect(shortestTurn(10, 350)).toBe(-20)
    expect(shortestTurn(90, 270)).toBe(180)
  })
})

describe('DisplayClock', () => {
  it('draws one lag behind the newest frame and advances at the sim rate', () => {
    const b = new MotionBuffer()
    b.push(10.0, [v('a', 0, 0, 0)])
    b.push(10.2, [v('a', 2, 0, 0)])
    b.push(10.4, [v('a', 4, 0, 0)])
    const c = new DisplayClock()
    const t0 = c.advance(1000, b, 1, true)!
    expect(t0).toBeCloseTo(10.4 - LAG_WALL_SECONDS)
    const t1 = c.advance(1100, b, 1, true)!
    expect(t1).toBeGreaterThan(t0)
    expect(t1).toBeLessThanOrEqual(10.4)
  })

  it('draws the newest frame outright when the tween is off', () => {
    const b = new MotionBuffer()
    b.push(1, [v('a', 0, 0, 0)])
    b.push(5, [v('a', 40, 0, 0)])
    expect(new DisplayClock().advance(0, b, 8, false)).toBe(5)
  })
})

describe('lane changes', () => {
  it('spreads the sideways jump over LANE_CHANGE_SECONDS instead of one frame', () => {
    const b = new MotionBuffer()
    // Heading north (angle 0) on S_out lane 0, then SUMO jumps it 3.2 m to lane 1.
    b.push(10.0, [v('a', 0, 0, 0, { lane: 'S_out_0' })])
    b.push(10.2, [v('a', 3.2, 2, 0, { lane: 'S_out_1' })])
    b.push(10.4, [v('a', 3.2, 4, 0, { lane: 'S_out_1' })])
    const out = new Map<string, Pose>()
    b.sample(10.2, out)
    const early = out.get('a')!
    expect(early.y).toBeCloseTo(2) // along-road motion exact
    expect(early.x).toBeLessThan(1.0) // still mostly in the old lane
    expect(Math.abs(early.angle)).toBeGreaterThan(0) // a touch of yaw
    b.push(10.0 + LANE_CHANGE_SECONDS + 0.2, [v('a', 3.2, 20, 0, { lane: 'S_out_1' })])
    b.sample(10.0 + LANE_CHANGE_SECONDS + 0.1, out)
    expect(out.get('a')!.x).toBeCloseTo(3.2) // drift complete: where SUMO put it
    expect(out.get('a')!.angle).toBeCloseTo(0)
  })

  it('leaves a turn (internal lane) and a merge onto another road alone', () => {
    const b = new MotionBuffer()
    b.push(1.0, [v('a', 0, 0, 90, { lane: 'E_in_0' })])
    b.push(1.2, [v('a', 2, -3.2, 100, { lane: ':C_5_0' })])
    const out = new Map<string, Pose>()
    b.sample(1.2, out)
    expect(out.get('a')!.y).toBeCloseTo(-3.2)
  })
})
