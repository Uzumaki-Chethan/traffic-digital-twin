/**
 * Junction plate geometry — verified against the compiled network
 * (sumo/network/intersection.net.xml, lefthand="true"):
 *
 *   N_in lanes x = 201.6 / 204.8 / 208.0  -> east of centre, kerb (N_in_0) easternmost
 *   S_in lanes x = 192.0 / 195.2 / 198.4  -> west of centre,  kerb (S_in_0) westernmost
 *   W_in lanes y = 201.6 / 204.8 / 208.0  -> north of centre, kerb (W_in_0) northernmost
 *   E_in lanes y = 192.0 / 195.2 / 198.4  -> south of centre, kerb (E_in_0) southernmost
 *
 * i.e. every inbound carriageway sits on the driver's LEFT (keep-left),
 * lane 0 = kerb = left turn, lane 1 = straight, lane 2 = median = right
 * turn (intersection.con.xml). SUMO's y axis points north; the SVG's
 * points down, so N is the top of the drawing.
 *
 * Canvas 920×540, centre (460,270). 6 lanes × 36 = 216 wide corridors.
 */

export const W = 920
export const H = 540
export const CX = 460
export const CY = 270
export const LANE = 36
export const HALF = 108 // corridor half-width
export const BOX = { x: CX - HALF, y: CY - HALF, w: 2 * HALF, h: 2 * HALF } // 352,162 216×216
export const KERB_R = 28

export type Axis = 'v' | 'h'
export interface LaneGeom {
  id: string
  approach: 'N' | 'S' | 'E' | 'W'
  axis: Axis
  /** perpendicular extent of the lane */
  lo: number
  hi: number
  /** along-axis: arm outer edge -> stop bar */
  outer: number
  stop: number
  /** direction of travel along the axis: +1 toward increasing coord */
  dir: 1 | -1
}

// Stop bars sit at the outer edge of an 8-unit pedestrian crossing that
// hugs the junction box (crossing band: 144–152 N, 388–396 S, 334–342 W,
// 578–586 E).
const STOP_N = BOX.y - 18 // 144
const STOP_S = BOX.y + BOX.h + 18 // 396
const STOP_W = BOX.x - 18 // 334
const STOP_E = BOX.x + BOX.w + 18 // 586
export const CROSSING = 8

export const LANES: LaneGeom[] = [
  // North approach, inbound southbound, east of median (x 460–568)
  { id: 'N_in_2', approach: 'N', axis: 'v', lo: 460, hi: 496, outer: 0, stop: STOP_N, dir: 1 },
  { id: 'N_in_1', approach: 'N', axis: 'v', lo: 496, hi: 532, outer: 0, stop: STOP_N, dir: 1 },
  { id: 'N_in_0', approach: 'N', axis: 'v', lo: 532, hi: 568, outer: 0, stop: STOP_N, dir: 1 },
  // South approach, inbound northbound, west of median (x 352–460)
  { id: 'S_in_0', approach: 'S', axis: 'v', lo: 352, hi: 388, outer: H, stop: STOP_S, dir: -1 },
  { id: 'S_in_1', approach: 'S', axis: 'v', lo: 388, hi: 424, outer: H, stop: STOP_S, dir: -1 },
  { id: 'S_in_2', approach: 'S', axis: 'v', lo: 424, hi: 460, outer: H, stop: STOP_S, dir: -1 },
  // West approach, inbound eastbound, north of median (y 162–270)
  { id: 'W_in_0', approach: 'W', axis: 'h', lo: 162, hi: 198, outer: 0, stop: STOP_W, dir: 1 },
  { id: 'W_in_1', approach: 'W', axis: 'h', lo: 198, hi: 234, outer: 0, stop: STOP_W, dir: 1 },
  { id: 'W_in_2', approach: 'W', axis: 'h', lo: 234, hi: 270, outer: 0, stop: STOP_W, dir: 1 },
  // East approach, inbound westbound, south of median (y 270–378)
  { id: 'E_in_2', approach: 'E', axis: 'h', lo: 270, hi: 306, outer: W, stop: STOP_E, dir: -1 },
  { id: 'E_in_1', approach: 'E', axis: 'h', lo: 306, hi: 342, outer: W, stop: STOP_E, dir: -1 },
  { id: 'E_in_0', approach: 'E', axis: 'h', lo: 342, hi: 378, outer: W, stop: STOP_E, dir: -1 },
]

export const LANE_BY_ID: Record<string, LaneGeom> = Object.fromEntries(LANES.map((l) => [l.id, l]))

/**
 * Pavement movement arrows, keep-left. Each is a path in canvas coords
 * ending in an arrowhead marker, so it must be drawn IN THE DIRECTION OF
 * TRAVEL — toward the junction for an inbound lane.
 *
 * The N and S sets were both inverted until 2026-09-13: they ran away
 * from the junction and curved to the wrong side, so a left-turn lane
 * was painted as a right turn pointing backwards. Travelling south (N
 * approach) the driver's left is EAST; travelling north (S approach) it
 * is WEST. Lane 0 is the kerb lane and turns left; lane 2 is the median
 * lane and turns right. E and W were always correct and are unchanged.
 */
export const ARROWS: Record<string, string> = {
  // N approach: travelling SOUTH (down the drawing). Left turn -> east.
  N_in_0: 'M 550 36 L 550 52 Q 550 60 558 60 L 564 60',
  N_in_1: 'M 514 36 L 514 64',
  N_in_2: 'M 478 36 L 478 52 Q 478 60 470 60 L 464 60',
  // S approach: travelling NORTH (up the drawing). Left turn -> west.
  S_in_0: 'M 370 504 L 370 488 Q 370 480 362 480 L 356 480',
  S_in_1: 'M 406 504 L 406 476',
  S_in_2: 'M 442 504 L 442 488 Q 442 480 450 480 L 456 480',
  W_in_0: 'M 120 180 L 132 180 Q 140 180 140 172 L 140 166',
  W_in_1: 'M 120 216 L 144 216',
  W_in_2: 'M 120 252 L 132 252 Q 140 252 140 260 L 140 266',
  E_in_2: 'M 800 288 L 788 288 Q 780 288 780 280 L 780 274',
  E_in_1: 'M 800 324 L 776 324',
  E_in_0: 'M 800 360 L 788 360 Q 780 360 780 368 L 780 374',
}

/** Where the lane-ID label sits, near the outer end of each lane. */
/**
 * Where a lane's label sits. E/W labels line up beside their lanes. N/S
 * lanes are only 36 units apart, narrower than any readable label, so
 * their three labels stack as a short legend at the top (N) or bottom
 * (S) of the arm, in lane order from the median outwards - each row
 * still points at its lane by order, not by column. (Three labels at
 * lane midpoints overlapped into one unreadable string - the 2026-09-13
 * visual check's first finding.)
 */
export function labelPos(l: LaneGeom): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const mid = (l.lo + l.hi) / 2
  if (l.axis === 'v') {
    const row = Number(l.id.slice(-1)) // 0, 1, 2 = left, straight, right
    const armMid = l.approach === 'N' ? (460 + 568) / 2 : (352 + 460) / 2
    const y = l.approach === 'N' ? 14 + row * 13 : H - 8 - (2 - row) * 13
    return { x: armMid, y, anchor: 'middle' }
  }
  return { x: l.approach === 'W' ? 6 : W - 6, y: mid + 3, anchor: l.approach === 'W' ? 'start' : 'end' }
}
