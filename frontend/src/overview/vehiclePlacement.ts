import type { VehicleView } from '@/data/types'
import { laneHeading, toSvg } from './plateGeometry'
import { shapeOf } from './vehicleTypes'

/**
 * Places real SUMO vehicles on the plan view.
 *
 * The plan view is to scale (plateGeometry), so a vehicle's SUMO
 * coordinate IS its drawn coordinate — the only work here is the
 * heading and the bumper offset. Until 2026-09-14 the plate was a
 * schematic with eleven-times-exaggerated lane widths, and this file
 * decomposed every position against its lane and re-drew turns along
 * Bezier curves to hide the seams; none of that is needed on a map.
 *
 * HEADING on an arm is the lane's own — SUMO changes lane as a sideways
 * jump between ticks, and a heading taken from that movement parks the
 * car at 45 degrees in its queue. Mid-junction, on an internal lane, the
 * movement since the last tick carries the heading, as the 3D view does,
 * so a turning car sweeps round; a car that has not moved yet faces the
 * way it came in. Headings are unwrapped against the vehicle's previous
 * one so the CSS transition turns the short way round rather than
 * spinning through 270 degrees.
 *
 * TraCI reports the FRONT BUMPER, not the centre — measured on a live
 * run, every stopped vehicle sits exactly 1.00 m before its stop line,
 * SUMO's own gap — so the body is drawn half its real length back along
 * its heading.
 */

export interface Placed {
  id: string
  type?: string
  /** Body centre, plan metres. */
  x: number
  y: number
  /** Degrees, 0 = east, 90 = south (down the screen); unwrapped. */
  angle: number
  moving: boolean
}

interface Memory {
  x: number
  y: number
  angle: number
}

/** Signed smallest rotation from a to b, in degrees. */
function shortestTurn(a: number, b: number): number {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/**
 * Last bumper position and emitted heading per vehicle. Module-level
 * because it must survive re-renders and is a pure drawing cache — it
 * holds no state the UI reads.
 */
const memory = new Map<string, Memory>()

function placeOne(v: VehicleView): Placed {
  const p = toSvg({ x: v.x, y: v.y })
  const prev = memory.get(v.id)
  const laneAngle = laneHeading(v.lane) ?? 0
  let angle: number
  if (!prev) {
    angle = laneAngle
  } else if (!v.lane.startsWith(':')) {
    angle = prev.angle + shortestTurn(prev.angle, laneAngle)
  } else {
    const dx = p.x - prev.x
    const dy = p.y - prev.y
    // Below 0.3 m the delta is noise (a queue creeping): keep the heading.
    const target = dx * dx + dy * dy > 0.09 ? (Math.atan2(dy, dx) * 180) / Math.PI : prev.angle
    angle = prev.angle + shortestTurn(prev.angle, target)
  }
  memory.set(v.id, { x: p.x, y: p.y, angle })

  const half = shapeOf(v.type).length / 2
  const rad = (angle * Math.PI) / 180
  return {
    id: v.id,
    type: v.type,
    x: p.x - Math.cos(rad) * half,
    y: p.y - Math.sin(rad) * half,
    angle,
    moving: v.speed > 0.3,
  }
}

/**
 * Place a whole snapshot's worth of vehicles, and forget anything that
 * has left the network so the cache cannot grow without bound.
 */
export function placeVehicles(vehicles: VehicleView[]): Placed[] {
  const placed = vehicles.map(placeOne)
  if (memory.size > placed.length * 2 + 32) {
    const live = new Set(placed.map((p) => p.id))
    for (const id of memory.keys()) {
      if (!live.has(id)) memory.delete(id)
    }
  }
  return placed
}
