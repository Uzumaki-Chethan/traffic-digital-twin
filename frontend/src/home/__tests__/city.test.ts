import { describe, expect, it } from 'vitest'
import { ALL_ROADS, SIDEWALK, buildCity, roadHalf } from '../city/layout'
import { CYCLE, LANE_LENGTH, buildLanes, lightFor, lightsAt, populate, stepLane } from '../city/traffic'

const city = buildCity()

describe('the morning city layout', () => {
  it('is the same city every time', () => {
    expect(JSON.stringify(buildCity())).toBe(JSON.stringify(city))
  })

  it('never builds on a road or its sidewalks', () => {
    let bad = 0
    for (const b of city.boxes) {
      for (const c of ALL_ROADS) {
        const keep = roadHalf(c) + SIDEWALK
        // footprint edges along x (against north–south roads) and z (east–west roads)
        if (!(b.x + b.w / 2 <= c - keep || b.x - b.w / 2 >= c + keep)) bad++
        if (!(b.z + b.d / 2 <= c - keep || b.z - b.d / 2 >= c + keep)) bad++
      }
    }
    expect(bad).toBe(0)
  })

  it('keeps parks free of buildings', () => {
    expect(city.parks).toHaveLength(4)
    const inPark = city.boxes.filter((b) => city.parks.some((p) => b.x > p.x0 && b.x < p.x1 && b.z > p.z0 && b.z < p.z1))
    expect(inPark).toHaveLength(0)
  })

  it('plants no tree in a building or on a carriageway', () => {
    const ground = city.boxes.filter((b) => b.y === 0)
    let inBuilding = 0
    let onRoad = 0
    for (const t of city.trees) {
      for (const b of ground) if (Math.abs(t.x - b.x) < b.w / 2 && Math.abs(t.z - b.z) < b.d / 2) inBuilding++
      for (const c of ALL_ROADS) {
        if (Math.abs(t.x - c) < roadHalf(c) && Math.abs(t.z) < 1140) onRoad++
        if (Math.abs(t.z - c) < roadHalf(c) && Math.abs(t.x) < 1140) onRoad++
      }
    }
    expect(city.trees.length).toBeGreaterThan(500)
    expect(inBuilding).toBe(0)
    expect(onRoad).toBe(0)
  })

  it('keeps the blocks round the junction low, so it stays in view', () => {
    const near = city.boxes.filter((b) => Math.abs(b.x) < 120 && Math.abs(b.z) < 120)
    expect(near.length).toBeGreaterThan(0)
    expect(Math.max(...near.map((b) => b.y + b.h))).toBeLessThan(55)
  })
})

describe('the morning city signals', () => {
  it('never shows green both ways, and one way is always red', () => {
    let bad = 0
    for (const offset of [0, 7, 13.5, 29]) {
      for (let t = 0; t < 2 * CYCLE; t += 0.05) {
        const { ns, ew } = lightsAt(t, offset)
        if (ns !== 'red' && ew !== 'red') bad++
      }
    }
    expect(bad).toBe(0)
  })

  it('goes through amber from green to red', () => {
    for (const axis of ['ns', 'ew'] as const) {
      let prev = lightsAt(0, 0)[axis]
      for (let t = 0.05; t < 2 * CYCLE; t += 0.05) {
        const now = lightsAt(t, 0)[axis]
        if (prev === 'green' && now !== 'green') expect(now).toBe('amber')
        if (now === 'green' && prev !== 'green') expect(prev).toBe('red')
        prev = now
      }
    }
  })
})

describe('the morning city traffic', () => {
  it('keeps its distance, stops at red, queues, and keeps moving', () => {
    const lanes = buildLanes()
    populate(lanes)
    const cars = lanes.reduce((n, l) => n + l.cars.length, 0)
    expect(cars).toBeGreaterThan(800)
    const dt = 0.05
    let t = 0
    let travelled = 0
    let queued = 0
    let overlaps = 0
    let redRuns = 0
    let speeding = 0
    const before: number[] = []
    // 90 simulated seconds: three full signal cycles at every crossing
    for (let step = 0; step < 1800; step++) {
      for (const lane of lanes) {
        const cs = lane.cars
        // positions before the step, by vehicle (the array may rotate on a wrap)
        const order = cs.slice()
        for (let i = 0; i < order.length; i++) before[i] = order[i].u
        stepLane(lane, t, dt)
        for (let i = 0; i < order.length; i++) {
          const car = order[i]
          const u0 = before[i]
          const moved = car.u >= u0 ? car.u - u0 : car.u + LANE_LENGTH - u0
          travelled += moved
          if (car.v > car.v0 + 1e-6) speeding++
          for (let k = 0; k < lane.stops.length; k++) {
            const s = lane.stops[k]
            const crossed = car.u >= u0 ? u0 < s.u && car.u > s.u : u0 < s.u || car.u > s.u
            const light = lightFor(lane, s, t)
            // over a red line only if it was already going through on amber
            if (crossed && light === 'red' && car.committed !== k) redRuns++
            if (car.v < 0.1 && light === 'red' && s.u - car.u > 0 && s.u - car.u < 12) queued++
          }
        }
        for (let i = 0; i < cs.length && cs.length > 1; i++) {
          const lead = cs[i === 0 ? cs.length - 1 : i - 1]
          let du = lead.u - cs[i].u
          if (du <= 0) du += LANE_LENGTH
          if (du - lead.len < -1e-6) overlaps++
        }
      }
      t += dt
    }
    expect(overlaps).toBe(0)
    expect(redRuns).toBe(0)
    expect(speeding).toBe(0)
    expect(queued).toBeGreaterThan(0)
    // average speed over the run: a moving city, not a gridlock
    expect(travelled / cars / t).toBeGreaterThan(3)
  }, 120_000)
})
