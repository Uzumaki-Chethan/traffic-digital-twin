/**
 * The junction's own topology, transcribed from
 * sumo/network/intersection.net.xml. Shared by the plan view and the 3D
 * miniature so there is exactly one copy of it.
 *
 * Twelve movements, three per approach, transcribed from the
 * `<connection ... via=":C_n_0">` elements. Lane 0 = left, 1 = straight,
 * 2 = right — left-hand traffic, so the LEFT turn is the tight near-side
 * one. `toLane` equals `fromLane` in every one of them, which is what
 * one-movement-per-lane channelization means, and is also why SUMO's own
 * conflict matrix gives all four left turns an empty foe list: every
 * movement lands in its own dedicated outbound lane and crosses nothing.
 */

export type Arm = 'N' | 'S' | 'E' | 'W'

export interface Point {
  x: number
  y: number
}

export interface Movement {
  from: Arm
  fromLane: number
  to: Arm
  toLane: number
  /** SUMO coordinates of the internal lane's own start and end. */
  start: Point
  end: Point
}

export const MOVEMENTS: Record<string, Movement> = {
  ':C_0_0': { from: 'S', fromLane: 0, to: 'W', toLane: 0, start: { x: 192.0, y: 178.4 }, end: { x: 178.4, y: 192.0 } },
  ':C_1_0': { from: 'S', fromLane: 1, to: 'N', toLane: 1, start: { x: 195.2, y: 178.4 }, end: { x: 195.2, y: 221.6 } },
  ':C_2_0': { from: 'S', fromLane: 2, to: 'E', toLane: 2, start: { x: 198.4, y: 178.4 }, end: { x: 221.6, y: 201.6 } },
  ':C_3_0': { from: 'E', fromLane: 0, to: 'S', toLane: 0, start: { x: 221.6, y: 192.0 }, end: { x: 208.0, y: 178.4 } },
  ':C_4_0': { from: 'E', fromLane: 1, to: 'W', toLane: 1, start: { x: 221.6, y: 195.2 }, end: { x: 178.4, y: 195.2 } },
  ':C_5_0': { from: 'E', fromLane: 2, to: 'N', toLane: 2, start: { x: 221.6, y: 198.4 }, end: { x: 198.4, y: 221.6 } },
  ':C_6_0': { from: 'N', fromLane: 0, to: 'E', toLane: 0, start: { x: 208.0, y: 221.6 }, end: { x: 221.6, y: 208.0 } },
  ':C_7_0': { from: 'N', fromLane: 1, to: 'S', toLane: 1, start: { x: 204.8, y: 221.6 }, end: { x: 204.8, y: 178.4 } },
  ':C_8_0': { from: 'N', fromLane: 2, to: 'W', toLane: 2, start: { x: 201.6, y: 221.6 }, end: { x: 178.4, y: 198.4 } },
  ':C_9_0': { from: 'W', fromLane: 0, to: 'N', toLane: 0, start: { x: 178.4, y: 208.0 }, end: { x: 192.0, y: 221.6 } },
  ':C_10_0': { from: 'W', fromLane: 1, to: 'E', toLane: 1, start: { x: 178.4, y: 204.8 }, end: { x: 221.6, y: 204.8 } },
  ':C_11_0': { from: 'W', fromLane: 2, to: 'S', toLane: 2, start: { x: 178.4, y: 201.6 }, end: { x: 201.6, y: 178.4 } },
}

export interface ArmLane {
  arm: Arm
  index: number
  inbound: boolean
}

export function parseArmLane(lane: string): ArmLane | null {
  const inb = /^([NSEW])_in_([0-2])$/.exec(lane)
  if (inb) return { arm: inb[1] as Arm, index: Number(inb[2]), inbound: true }
  const out = /^C_out_([NSEW])_([0-2])$/.exec(lane)
  if (out) return { arm: out[1] as Arm, index: Number(out[2]), inbound: false }
  return null
}

/**
 * Heading in the 3D scene for traffic on a given lane, in radians, where
 * 0 = travelling south (+z) — matching `Math.atan2(dx, dz)`.
 *
 * Used to give a vehicle a sensible heading the moment it appears, which
 * matters more than it sounds: a car that enters the network already
 * stopped in a queue never produces a movement delta, so without this it
 * would sit at the stop line facing whatever the default was — which is
 * exactly why cars were parked sideways at the signal.
 */
const HEADING_IN_3D: Record<Arm, number> = {
  N: 0, // southbound
  S: Math.PI, // northbound
  E: -Math.PI / 2, // westbound
  W: Math.PI / 2, // eastbound
}
const HEADING_OUT_3D: Record<Arm, number> = {
  N: Math.PI, // onto the north arm, travelling north
  S: 0,
  E: Math.PI / 2,
  W: -Math.PI / 2,
}

export function laneHeading3D(lane: string): number | null {
  const movement = MOVEMENTS[lane]
  // Mid-junction: face the way it came in. The per-tick movement delta
  // takes over from the next tick and sweeps it round.
  if (movement) return HEADING_IN_3D[movement.from]
  const parsed = parseArmLane(lane)
  if (!parsed) return null
  return parsed.inbound ? HEADING_IN_3D[parsed.arm] : HEADING_OUT_3D[parsed.arm]
}
