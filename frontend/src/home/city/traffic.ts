/**
 * The morning city's traffic (Section 48): right-hand traffic on the inner
 * grid's roads, a signal at every crossing, and the Intelligent Driver
 * Model for following — so vehicles keep their distance, queue at red,
 * and pull away on green. Pure logic, no three.js: the scene draws it and
 * the tests check it. Illustration only — nothing here is the real model.
 *
 * A lane is a loop: its u runs 0 → LANE_LENGTH in the direction of travel,
 * from one end of the city (−EXTENT) to the other (+EXTENT), and wraps. A
 * vehicle's u is its FRONT bumper.
 */

import { GRID, ROADS, roadHalf, rng } from './layout'

export const EXTENT = 1100
export const LANE_LENGTH = EXTENT * 2
/** Every crossing's signal: one cycle, two phases with amber and all-red. */
export const CYCLE = 30

export type Light = 'green' | 'amber' | 'red'
/** 'x': a road running east–west (along x); 'z': one running north–south. */
export type Axis = 'x' | 'z'

/** A crossing's lights at time t: north–south (roads along z), then east–west. */
export function lightsAt(t: number, offset: number): { ns: Light; ew: Light } {
  const u = (((t + offset) % CYCLE) + CYCLE) % CYCLE
  return {
    ns: u < 13 ? 'green' : u < 15 ? 'amber' : 'red',
    ew: u >= 16 && u < 27 ? 'green' : u >= 27 && u < 29 ? 'amber' : 'red',
  }
}

/** Crossings run offset from each other, so the city doesn't change in unison; the home junction is offset 0. */
export function signalOffset(x: number, z: number) {
  return ((((x / GRID) * 7 + (z / GRID) * 11) % CYCLE) + CYCLE) % CYCLE
}

export type VehicleKind = 'car' | 'moto' | 'auto' | 'bus' | 'truck'

/** Length, width (metres) and the range of free-road speeds (m/s). */
export const VEHICLES: Record<VehicleKind, { len: number; width: number; v0: [number, number] }> = {
  car: { len: 4.4, width: 1.8, v0: [11, 14] },
  moto: { len: 2, width: 0.8, v0: [11, 14.5] },
  auto: { len: 2.7, width: 1.4, v0: [8.5, 10.5] },
  bus: { len: 11, width: 2.5, v0: [9, 11] },
  truck: { len: 8.2, width: 2.5, v0: [9, 11] },
}

export interface Vehicle {
  kind: VehicleKind
  u: number
  v: number
  /** Free-road speed. */
  v0: number
  len: number
  /** Decelerating, or standing: the brake lights are on. */
  brake: boolean
  /** The stop line it is going through on amber (too close to stop), or -1. */
  committed: number
  /** 0–1: picks its colour. */
  tone: number
}

export interface Stop {
  /** The stop line, in lane u. */
  u: number
  /** The crossing it guards. */
  x: number
  z: number
}

export interface Lane {
  axis: Axis
  /** The road's centre line (z for an east–west road, x for a north–south one). */
  c: number
  /** Lateral offset of the lane's centre from the road's. */
  off: number
  /** Travel direction along the axis. */
  dir: 1 | -1
  /** Stop lines, ascending u. */
  stops: Stop[]
  /** Front (largest u) first. */
  cars: Vehicle[]
}

/** World [x, z] of a point at u on a lane. */
export function laneXZ(lane: Lane, u: number): [number, number] {
  const along = lane.dir === 1 ? -EXTENT + u : EXTENT - u
  return lane.axis === 'x' ? [along, lane.c + lane.off] : [lane.c + lane.off, along]
}

function makeLane(axis: Axis, c: number, off: number, dir: 1 | -1): Lane {
  const stops = ROADS.map((r) => {
    const centre = dir === 1 ? r + EXTENT : EXTENT - r
    // the front bumper stops behind the crossing's zebra
    return { u: centre - (roadHalf(r) + 5.6), x: axis === 'x' ? r : c, z: axis === 'x' ? c : r }
  }).toSorted((p, q) => p.u - q.u)
  return { axis, c, off, dir, stops, cars: [] }
}

/** Right-hand traffic: eastbound (+x) keeps to the south (+z) half of an
 * east–west road; southbound (+z) keeps to the west (−x) half of a
 * north–south one. The junction's two roads have two lanes each way. */
export function buildLanes(): Lane[] {
  const lanes: Lane[] = []
  for (const c of ROADS) {
    for (const off of c === 0 ? [2.75, 8.25] : [3]) {
      lanes.push(makeLane('x', c, off, 1), makeLane('x', c, -off, -1), makeLane('z', c, -off, 1), makeLane('z', c, off, -1))
    }
  }
  return lanes
}

function pickKind(x: number): VehicleKind {
  return x < 0.55 ? 'car' : x < 0.75 ? 'moto' : x < 0.87 ? 'auto' : x < 0.93 ? 'bus' : 'truck'
}

/** Fill every lane: busier on the junction's own roads. */
export function populate(lanes: Lane[], seed = 7) {
  const r = rng(seed)
  for (const lane of lanes) {
    const spacing = lane.c === 0 ? 30 : 52
    const cars: Vehicle[] = []
    let u = r() * spacing
    while (u < LANE_LENGTH - 15) {
      const kind = pickKind(r())
      const spec = VEHICLES[kind]
      const v0 = spec.v0[0] + r() * (spec.v0[1] - spec.v0[0])
      u += spec.len
      cars.push({ kind, u, v: v0 * 0.8, v0, len: spec.len, brake: false, committed: -1, tone: r() })
      u += spacing * (0.4 + r() * 1.2)
    }
    lane.cars = cars.toSorted((p, q) => q.u - p.u)
  }
}

/** The light a lane sees at one of its stop lines. */
export function lightFor(lane: Lane, stop: Stop, t: number): Light {
  const l = lightsAt(t, signalOffset(stop.x, stop.z))
  return lane.axis === 'x' ? l.ew : l.ns
}

// Intelligent Driver Model: max acceleration, comfortable braking,
// standstill gap, time headway.
const A = 1.6
const B = 3.2
const S0 = 2.2
const T = 1.1
/** How far ahead a driver watches the next light. */
const LOOK = 120

/** Advance one lane by dt seconds at time t. */
export function stepLane(lane: Lane, t: number, dt: number) {
  const cs = lane.cars
  const n = cs.length
  if (!n || dt <= 0) return
  for (let i = 0; i < n; i++) {
    const car = cs[i]
    let gap = Number.POSITIVE_INFINITY
    let dv = 0
    if (n > 1) {
      const lead = cs[i === 0 ? n - 1 : i - 1]
      let du = lead.u - car.u
      if (du <= 0) du += LANE_LENGTH
      gap = du - lead.len
      dv = car.v - lead.v
    }

    // the nearest stop line ahead
    let k = lane.stops.findIndex((s) => s.u > car.u - 0.3)
    let dist = 0
    if (k === -1) {
      k = 0
      dist = lane.stops[0].u + LANE_LENGTH - car.u
    } else dist = Math.max(0, lane.stops[k].u - car.u)
    if (car.committed !== -1 && car.committed !== k) car.committed = -1
    if (dist < LOOK && car.committed !== k) {
      const light = lightFor(lane, lane.stops[k], t)
      if (light !== 'green') {
        const canStop = dist > (car.v * car.v) / (2 * B) + 0.5
        if (light === 'red' || canStop) {
          if (dist < gap) {
            gap = dist
            dv = car.v
          }
        } else car.committed = k // amber, too close to stop: go through
      }
    }

    const sStar = S0 + Math.max(0, car.v * T + (car.v * dv) / (2 * Math.sqrt(A * B)))
    const acc = Math.max(-9, A * (1 - (car.v / car.v0) ** 4 - (sStar / Math.max(gap, 0.1)) ** 2))
    car.v = Math.max(0, car.v + acc * dt)
    // never into the vehicle ahead, never over a red line
    const move = Math.min(car.v * dt, Math.max(0, gap - 0.3))
    car.u += move
    if (car.u >= LANE_LENGTH) car.u -= LANE_LENGTH
    car.brake = acc < -0.8 || car.v < 0.4
  }
  // keep the lane front-first after a wrap
  while (cs.length > 1 && cs[0].u < cs[cs.length - 1].u) {
    const front = cs.shift()
    if (front) cs.push(front)
  }
}
