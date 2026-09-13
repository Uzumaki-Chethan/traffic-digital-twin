import type { VehicleView } from '@/data/types'
import { BOX, CX, CY, H, LANE, W } from './plateGeometry'
import { MOVEMENTS, parseArmLane, type Arm, type Point } from './junctionTopology'
import { plateSize, shapeOf } from './vehicleTypes'

/**
 * Places real SUMO vehicles on the schematic plate.
 *
 * The plate is deliberately NOT to scale: a 9.6 m carriageway is drawn
 * 108 units wide while a 178 m approach is drawn 144 units long — about
 * fourteen times exaggerated laterally, which is what makes lanes
 * readable from across a room. So a single linear transform of the SUMO
 * coordinates would put every vehicle in a hairline down the middle of
 * the road.
 *
 * Each vehicle is therefore decomposed against its own lane: the lane id
 * gives the arm and the lane index (so it sits in the middle of its
 * DRAWN lane), and the SUMO coordinate gives how far along that arm it
 * has travelled.
 *
 * THE JUNCTION is the hard part, and was previously wrong in a way that
 * showed: a vehicle on one of SUMO's internal `:C_*` lanes fell back to a
 * plain linear map of the whole network, which uses a completely
 * different lateral scale — so every car jumped sideways the instant it
 * crossed the stop line, snapped its orientation 90 degrees, and jumped
 * back on the far side. That is the "shuffle and jump" turning.
 *
 * Instead, every internal lane is now resolved through the network's own
 * connection table (below, read straight out of intersection.net.xml) to
 * the arm and lane it comes FROM and goes TO. The vehicle is then drawn
 * along a quadratic Bezier between those two drawn stop-line points,
 * with its heading interpolated the same way. Both endpoints coincide
 * exactly with the arm placement, so entering and leaving the junction
 * are continuous — no jump to hide.
 *
 * Verified against the compiled network (sumo/network/intersection.net.xml):
 *   N_in lane shapes run y 400 -> 221.6   (arm length 178.4 m)
 *   S_in                 y   0 -> 178.4
 *   E_in                 x 400 -> 221.6
 *   W_in                 x   0 -> 178.4
 *   N_in x = 208.0/204.8/201.6 for lanes 0/1/2  -> lane 0 is the KERB lane
 *   C_out_N x = 192.0/195.2/198.4               -> outbound, other side
 */

const ARM_METRES = 178.4
const NET_SPAN = 400 // SUMO network is 400 m square, junction C at (200, 200)

/** Drawn stop-bar positions, from plateGeometry. */
const STOP_N = BOX.y - 18 // 144
const STOP_S = BOX.y + BOX.h + 18 // 396
const STOP_W = BOX.x - 18 // 334
const STOP_E = BOX.x + BOX.w + 18 // 586

export interface Placed {
  id: string
  /** SUMO type id, passed through so the view can size and colour it. */
  type?: string
  x: number
  y: number
  /**
   * Heading in degrees, 0 = travelling east (+x), 90 = south (+y, down
   * the screen). Unwrapped against this vehicle's previous heading, so a
   * car turning from -90 to 180 goes the short way round instead of
   * spinning through 270 degrees when the value is interpolated.
   */
  angle: number
  moving: boolean
}

/**
 * Distance of a drawn lane centre from its corridor centreline, in plate
 * units, for SUMO lane index `i`. Lane 0 is the KERB lane — furthest
 * from the median — which is the left-turn lane in this left-hand
 * network. Three 36-unit lanes: 90, 54, 18.
 */
function lateral(index: number): number {
  return LANE * (2 - index) + LANE / 2
}

/**
 * Which side of the centreline an INBOUND carriageway sits on, as a
 * signed multiplier of `lateral()`. Keep-left: N and E inbound are on
 * the positive side (east / south of centre), S and W on the negative.
 * Outbound is always the opposite side of the same arm.
 */
const INBOUND_SIDE: Record<Arm, 1 | -1> = { N: 1, E: 1, S: -1, W: -1 }

/** Heading of traffic travelling INBOUND on each arm, in drawn degrees. */
const HEADING_IN: Record<Arm, number> = { N: 90, S: -90, E: 180, W: 0 }
/** Heading of traffic travelling OUTBOUND onto each arm. */
const HEADING_OUT: Record<Arm, number> = { N: -90, S: 90, E: 0, W: 180 }

/** Where a given lane meets the junction, in drawn coordinates. */
function stopLinePoint(arm: Arm, index: number, inbound: boolean): Point {
  const off = lateral(index) * INBOUND_SIDE[arm] * (inbound ? 1 : -1)
  switch (arm) {
    case 'N':
      return { x: CX + off, y: STOP_N }
    case 'S':
      return { x: CX + off, y: STOP_S }
    case 'E':
      return { x: STOP_E, y: CY + off }
    default:
      return { x: STOP_W, y: CY + off }
  }
}

const VERTICAL_ARM: Record<Arm, boolean> = { N: true, S: true, E: false, W: false }

/** Signed smallest rotation from a to b, in degrees. */
function shortestTurn(a: number, b: number): number {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/**
 * Last emitted heading per vehicle, so successive frames stay on the
 * same branch of the angle and a CSS transition interpolates the short
 * way round. Module-level because it must survive re-renders and is a
 * pure drawing cache — it holds no state the UI reads.
 */
const lastHeading = new Map<string, number>()

function continuousHeading(id: string, angle: number): number {
  const prev = lastHeading.get(id)
  const next = prev === undefined ? angle : prev + shortestTurn(prev, angle)
  lastHeading.set(id, next)
  return next
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Quadratic Bezier. */
function bezier(p0: Point, c: Point, p2: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y,
  }
}

/**
 * Control point for a movement: where the entry and exit centrelines
 * would meet. For a turn that is the corner they share, which produces a
 * turn that hugs the inside of the junction the way a real one does; for
 * a straight-through movement the two are collinear, so the midpoint
 * gives a straight line.
 */
function controlPoint(from: Arm, to: Arm, p0: Point, p2: Point): Point {
  const entryVertical = VERTICAL_ARM[from]
  if (entryVertical === VERTICAL_ARM[to]) return { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 }
  return entryVertical ? { x: p0.x, y: p2.y } : { x: p2.x, y: p0.y }
}

function placeOne(v: VehicleView): Placed {
  const moving = v.speed > 0.3

  // Crossing the junction: follow the drawn path of its actual movement.
  const movement = MOVEMENTS[v.lane]
  if (movement) {
    const p0 = stopLinePoint(movement.from, movement.fromLane, true)
    const p2 = stopLinePoint(movement.to, movement.toLane, false)
    const here = { x: v.x, y: v.y }
    // Progress by distance between the internal lane's own endpoints:
    // exactly 0 entering and 1 leaving, so both handoffs are seamless.
    const d0 = distance(here, movement.start)
    const d1 = distance(here, movement.end)
    const t = d0 + d1 === 0 ? 0 : Math.max(0, Math.min(1, d0 / (d0 + d1)))
    const p = bezier(p0, controlPoint(movement.from, movement.to, p0, p2), p2, t)
    const a0 = HEADING_IN[movement.from]
    const a2 = HEADING_OUT[movement.to]
    return {
      id: v.id,
      type: v.type,
      x: p.x,
      y: p.y,
      angle: continuousHeading(v.id, a0 + shortestTurn(a0, a2) * t),
      moving,
    }
  }

  const parsed = parseArmLane(v.lane)
  if (!parsed) {
    // Some lane the network does not describe. Should not happen; map it
    // linearly rather than dropping the vehicle silently.
    return {
      id: v.id,
      type: v.type,
      x: (v.x / NET_SPAN) * W,
      y: H - (v.y / NET_SPAN) * H,
      angle: continuousHeading(v.id, 0),
      moving,
    }
  }

  const { arm, index, inbound } = parsed
  const off = lateral(index) * INBOUND_SIDE[arm] * (inbound ? 1 : -1)

  // Progress along the arm, 0 at the outer edge of the network, 1 at the
  // stop line — the same measure whichever way the vehicle is travelling.
  let along: number
  if (arm === 'N') along = (NET_SPAN - v.y) / ARM_METRES
  else if (arm === 'S') along = v.y / ARM_METRES
  else if (arm === 'E') along = (NET_SPAN - v.x) / ARM_METRES
  else along = v.x / ARM_METRES
  const t = Math.max(0, Math.min(1, along))

  const angle = continuousHeading(v.id, inbound ? HEADING_IN[arm] : HEADING_OUT[arm])

  switch (arm) {
    case 'N':
      return { id: v.id, type: v.type, x: CX + off, y: t * STOP_N, angle, moving }
    case 'S':
      return { id: v.id, type: v.type, x: CX + off, y: H - t * (H - STOP_S), angle, moving }
    case 'E':
      return { id: v.id, type: v.type, x: W - t * (W - STOP_E), y: CY + off, angle, moving }
    default:
      return { id: v.id, type: v.type, x: t * STOP_W, y: CY + off, angle, moving }
  }
}

/**
 * TraCI reports a vehicle's FRONT BUMPER, not its centre — measured on a
 * live run, every stopped vehicle sits exactly 1.00 m before its stop
 * line, which is SUMO's own gap. Drawing the marker centred on that point
 * therefore pushed half of every vehicle across the stop bar and into the
 * junction. Shift back along the heading by half the DRAWN length (the
 * plate is not to scale longitudinally, so it is the drawn length that
 * has to line up, not the real one).
 */
function bumperToCentre(p: Placed): Placed {
  const half = plateSize(shapeOf(p.type)).length / 2
  const rad = (p.angle * Math.PI) / 180
  return { ...p, x: p.x - Math.cos(rad) * half, y: p.y - Math.sin(rad) * half }
}

/**
 * Place a whole snapshot's worth of vehicles, and forget the heading of
 * anything that has left the network so the cache cannot grow without
 * bound over a long run.
 */
export function placeVehicles(vehicles: VehicleView[]): Placed[] {
  const placed = vehicles.map(placeOne).map(bumperToCentre)
  if (lastHeading.size > placed.length * 2 + 32) {
    const live = new Set(placed.map((p) => p.id))
    for (const id of lastHeading.keys()) {
      if (!live.has(id)) lastHeading.delete(id)
    }
  }
  return placed
}
