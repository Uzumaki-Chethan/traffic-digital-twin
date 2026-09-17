/**
 * Plan-view geometry, in METRES — the network's own coordinates.
 *
 * Since 2026-09-14 the plan view is a map, not a schematic: one SVG user
 * unit is one metre, x is SUMO's x, and y is `NET - sumo_y` because
 * SUMO's y axis points north while the SVG's points down. Everything
 * here is transcribed from sumo/network/intersection.net.xml:
 *
 *   network            400 x 400 m, junction C at (200, 200)
 *   lanes              3.2 m wide, three per direction (9.6 m corridors)
 *   inbound lanes end  21.6 m from the centre (x/y = 178.4 or 221.6)
 *   junction corners   11 m kerb fillets (the net polygon has 12; see KERB_R)
 *   N_in lane centres  x = 208.0 / 204.8 / 201.6 for lanes 0 / 1 / 2
 *   C_out_N            x = 192.0 / 195.2 / 198.4 - the other side
 *
 * Keep-left: every inbound carriageway sits on the driver's left, lane 0
 * = kerb = left turn, lane 1 = straight, lane 2 = median = right turn.
 *
 * The schematic this replaced drew 3.2 m lanes 36 units wide and 178 m
 * arms 334 units long — eleven times wider than long — so true-length
 * vehicles read as dots in an empty lane and heavy traffic looked light.
 * At true scale the same queue looks exactly as it does in sumo-gui; the
 * viewport zooms instead (usePanZoom).
 */

import { MOVEMENTS, parseArmLane, type Arm } from './junctionTopology'

export const NET = 400
export const CENTRE = 200
export const LANE_W = 3.2
export const ROAD_HALF = 9.6
export const JUNCTION_HALF = 21.6
/**
 * The junction's corner fillets. The net file's junction polygon has
 * 12 m corners, but that polygon is where the lanes end, not a kerb: the
 * left-turn lane's centre runs only 1.6 m inside it, which put a 1.8 m
 * car's flank on the line. Drawn 1 m tighter in both views, so a turning
 * vehicle keeps ~1.7 m clear of it.
 */
export const KERB_R = 11
/** Inbound lane length: the 200 m arm minus the 21.6 m to the stop line. */
export const ARM_METRES = CENTRE - JUNCTION_HALF // 178.4

/** The plate's own aspect - the viewport box it is drawn into. */
export const PLATE_ASPECT = 920 / 540

export interface Point {
  x: number
  y: number
}

/** SUMO coordinates -> plan-view coordinates (north up). */
export function toSvg(p: Point): Point {
  return { x: p.x, y: NET - p.y }
}

export type Axis = 'v' | 'h'
export interface LaneGeom {
  id: string
  approach: Arm
  index: number
  axis: Axis
  /** Perpendicular extent of the lane (x for a vertical lane, y for horizontal). */
  lo: number
  hi: number
  /** Along-axis: arm outer edge -> stop line. */
  outer: number
  stop: number
  /** Direction of travel along the axis: +1 toward increasing coordinate. */
  dir: 1 | -1
  /** Heading of inbound travel, degrees, 0 = +x (east), 90 = +y (down/south). */
  heading: number
}

/**
 * Lateral offset of a lane centre from the road centreline, signed, in
 * the plan view's coordinates. Inbound is on the driver's left: for the
 * N approach (travelling south) that is east (+x); S (north) -> west;
 * W (east) -> north, which is -y here; E (west) -> south (+y). Lane 0 is
 * the kerb lane, furthest out.
 */
function lateral(arm: Arm, index: number, inbound: boolean): number {
  const out = (2 - index) * LANE_W + LANE_W / 2 // 8.0, 4.8, 1.6
  const side = arm === 'N' || arm === 'E' ? 1 : -1
  return out * side * (inbound ? 1 : -1)
}

const HEADING_IN: Record<Arm, number> = { N: 90, S: -90, E: 180, W: 0 }
const HEADING_OUT: Record<Arm, number> = { N: -90, S: 90, E: 0, W: 180 }

function inboundLane(arm: Arm, index: number): LaneGeom {
  const id = `${arm}_in_${index}`
  const off = lateral(arm, index, true)
  const centre = CENTRE + off
  const lo = centre - LANE_W / 2
  const hi = centre + LANE_W / 2
  switch (arm) {
    case 'N':
      return { id, approach: arm, index, axis: 'v', lo, hi, outer: 0, stop: CENTRE - JUNCTION_HALF, dir: 1, heading: 90 }
    case 'S':
      return { id, approach: arm, index, axis: 'v', lo, hi, outer: NET, stop: CENTRE + JUNCTION_HALF, dir: -1, heading: -90 }
    case 'W':
      return { id, approach: arm, index, axis: 'h', lo, hi, outer: 0, stop: CENTRE - JUNCTION_HALF, dir: 1, heading: 0 }
    default:
      return { id, approach: arm, index, axis: 'h', lo, hi, outer: NET, stop: CENTRE + JUNCTION_HALF, dir: -1, heading: 180 }
  }
}

export const LANES: LaneGeom[] = (['N', 'S', 'W', 'E'] as Arm[]).flatMap((arm) =>
  [0, 1, 2].map((i) => inboundLane(arm, i)),
)

export const LANE_BY_ID: Record<string, LaneGeom> = Object.fromEntries(LANES.map((l) => [l.id, l]))

/** Centre of the lane at the stop line, plan coordinates. */
export function stopLinePoint(l: LaneGeom): Point {
  const mid = (l.lo + l.hi) / 2
  return l.axis === 'v' ? { x: mid, y: l.stop } : { x: l.stop, y: mid }
}

/**
 * Heading, in plan degrees, for traffic on any lane the network names —
 * the first heading a vehicle gets before it has moved. Mid-junction it
 * faces the way it came in; the movement delta sweeps it round.
 */
export function laneHeading(lane: string): number | null {
  const movement = MOVEMENTS[lane]
  if (movement) return HEADING_IN[movement.from]
  const parsed = parseArmLane(lane)
  if (!parsed) return null
  return parsed.inbound ? HEADING_IN[parsed.arm] : HEADING_OUT[parsed.arm]
}

/**
 * Painted movement arrow for a lane, as a path in a LOCAL frame: the lane
 * runs along +x toward the stop line at x = 0, lane centre at y = 0, and
 * because rotation keeps handedness, the driver's left is always -y.
 * Sized like real road paint: 5 m long, starting 7 m before the line.
 *
 * A turn arrow stays INSIDE its 3.2 m lane: the stem, then a bend that
 * ends 1.0 m off centre heading 45°, so the 0.8 m head (markerEnd,
 * centred on the path's end) tips out at ~1.57 m — the kerb lane's arrow
 * used to run 1.4 m onto the verge and the inner lane's across the median.
 */
export function arrowPath(index: number): string {
  const tail = -12
  const head = -7
  if (index === 1) return `M ${tail} 0 L ${head} 0`
  const side = index === 0 ? -1 : 1 // lane 0 turns left (-y), lane 2 right
  const bend = tail + 3.2
  return `M ${tail} 0 L ${bend} 0 Q ${bend + 1.4} 0 ${bend + 2.4} ${side * 1.0}`
}

/** Rotation that takes the local arrow frame onto a lane. */
export function laneTransform(l: LaneGeom): string {
  const p = stopLinePoint(l)
  return `translate(${p.x} ${p.y}) rotate(${l.heading})`
}

/**
 * The junction's outline, exactly the `<junction id="C">` shape: a
 * 19.2 m-wide opening on each side joined by KERB_R quarter-circle kerbs
 * that curve INTO the corner (centred on the outer corner, so the road
 * corner is filleted, not bulged) - the shape's own vertices
 * (212.6, 187.4) etc. sit 12 m from (221.6, 178.4).
 */
export function junctionOutline(): string {
  const a = CENTRE - JUNCTION_HALF // 178.4
  const b = CENTRE + JUNCTION_HALF // 221.6
  const lo = CENTRE - ROAD_HALF // 190.4
  const hi = CENTRE + ROAD_HALF // 209.6
  const r = KERB_R
  return [
    `M ${lo} ${a} L ${hi} ${a}`,
    `A ${r} ${r} 0 0 0 ${b} ${lo}`,
    `L ${b} ${hi}`,
    `A ${r} ${r} 0 0 0 ${hi} ${b}`,
    `L ${lo} ${b}`,
    `A ${r} ${r} 0 0 0 ${a} ${hi}`,
    `L ${a} ${lo}`,
    `A ${r} ${r} 0 0 0 ${lo} ${a}`,
    'Z',
  ].join(' ')
}

/** The four arms as road rectangles: [x, y, w, h]. */
export const ARM_RECTS: Array<[number, number, number, number]> = [
  [CENTRE - ROAD_HALF, 0, 2 * ROAD_HALF, CENTRE - JUNCTION_HALF], // north
  [CENTRE - ROAD_HALF, CENTRE + JUNCTION_HALF, 2 * ROAD_HALF, CENTRE - JUNCTION_HALF], // south
  [0, CENTRE - ROAD_HALF, CENTRE - JUNCTION_HALF, 2 * ROAD_HALF], // west
  [CENTRE + JUNCTION_HALF, CENTRE - ROAD_HALF, CENTRE - JUNCTION_HALF, 2 * ROAD_HALF], // east
]

export const APPROACH_NAMES: Record<Arm, string> = { N: 'North', S: 'South', E: 'East', W: 'West' }
