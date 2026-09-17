/**
 * The junction's own topology types, shared by the plan view and the 3D
 * miniature. The geometry itself (lane centres, the junction outline,
 * arm lengths — all transcribed from sumo/network/intersection.net.xml)
 * lives in plateGeometry.ts; vehicle headings come from SUMO itself
 * (`angle` on every vehicle, since 2026-09-17), so the movement table and
 * the lane-heading derivations that used to live here are gone.
 */

export type Arm = 'N' | 'S' | 'E' | 'W'

export interface Point {
  x: number
  y: number
}
