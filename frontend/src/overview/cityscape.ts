/**
 * The city around junction C — one layout, drawn by both the plan
 * (JunctionPlate) and the 3D model (Junction3D) so the two views show the
 * same streets, the same buildings and the same trees.
 *
 * Plan frame, metres: x east, y SOUTH, the network centre at (200, 200) —
 * plateGeometry's frame. Junction3D maps it as x3 = x − 200, z3 = y − 200.
 *
 * This is scenery, not data: SUMO's network has no buildings or trees, so
 * none of this is claimed to be real. It is laid out deterministically
 * (fixed seed) so it never shifts between renders or between the views,
 * and it keeps clear of everything that IS real — the carriageways, the
 * junction and its kerb fillets, and a sidewalk strip along every road.
 */

import { CENTRE, NET, ROAD_HALF } from './plateGeometry'

/** Sidewalk: from the carriageway edge out to here, metres from the centre line. */
export const SIDEWALK_OUT = ROAD_HALF + 4.2
/** Street trees stand in a verge just beyond the sidewalk. */
const TREE_LINE = SIDEWALK_OUT + 3.4
/** Nothing is built closer to the road than this. */
const SETBACK = TREE_LINE + 5
/** How far past the network edge the city continues. Zero: the scenery and
 * the roads end together at the network's 400 m edge (owner, 2026-09-30). */
export const CITY_EXTENT = 0

export interface Building {
  x: number
  y: number
  w: number
  h: number
  /** Metres tall, for the 3D view (the plan uses it only for shadow length). */
  height: number
  /** 0–1, picks the roof tone. */
  tone: number
  /** Rooftop plant unit, as an offset within the roof (0–1), or null. */
  unit: { u: number; v: number } | null
}

export interface Tree {
  x: number
  y: number
  r: number
  /** 0–1, picks the canopy shade. */
  tone: number
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function build(): { buildings: Building[]; trees: Tree[] } {
  const r = rng(20260930)
  const buildings: Building[] = []
  const trees: Tree[] = []
  const lo = -CITY_EXTENT
  const hi = NET + CITY_EXTENT

  // Four quadrants, each filled with blocks of lots in rows parallel to
  // the nearer road. Distances are from the centre lines.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      let dy = SETBACK
      while (dy < CENTRE - lo - 6) {
        const depth = 14 + r() * 16
        let dx = SETBACK
        while (dx < CENTRE - lo - 6) {
          const w = 12 + r() * 22
          // Leave some lots as open ground / parks so it reads as a city
          // with space in it rather than a solid wall.
          if (r() > 0.2) {
            const bw = w - 3 - r() * 3
            const bh = depth - 3 - r() * 3
            const cx = CENTRE + sx * (dx + w / 2)
            const cy = CENTRE + sy * (dy + depth / 2)
            if (cx - bw / 2 > lo && cx + bw / 2 < hi && cy - bh / 2 > lo && cy + bh / 2 < hi) {
              buildings.push({
                x: cx - bw / 2,
                y: cy - bh / 2,
                w: bw,
                h: bh,
                height: 5 + r() * r() * 26,
                tone: r(),
                unit: r() > 0.25 ? { u: 0.25 + r() * 0.5, v: 0.25 + r() * 0.5 } : null,
              })
            }
          } else if (r() > 0.4) {
            // a small park: a cluster of trees on the empty lot
            for (let k = 0; k < 3; k++) {
              trees.push({
                x: CENTRE + sx * (dx + 3 + r() * (w - 6)),
                y: CENTRE + sy * (dy + 3 + r() * (depth - 6)),
                r: 2 + r() * 1.6,
                tone: r(),
              })
            }
          }
          dx += w
        }
        dy += depth + 6 + r() * 6
      }
    }
  }

  // Street trees along every arm, both sides, clear of the junction.
  for (const side of [-1, 1]) {
    for (let d = SETBACK + 8; d < CENTRE - lo - 4; d += 13 + r() * 6) {
      for (const dir of [-1, 1]) {
        const off = side * (TREE_LINE + (r() - 0.5) * 0.8)
        const radius = 2.1 + r() * 1.2
        trees.push({ x: CENTRE + off, y: CENTRE + dir * d, r: radius, tone: r() }) // along N–S arms
        trees.push({ x: CENTRE + dir * d, y: CENTRE + off, r: radius, tone: r() }) // along E–W arms
      }
    }
  }
  return { buildings, trees }
}

const CITY = build()
export const BUILDINGS: readonly Building[] = CITY.buildings
export const TREES: readonly Tree[] = CITY.trees

/** Roof and canopy palettes, shared so both views agree. */
export const ROOF_TONES = ['#ECE6DA', '#E4DCCB', '#F1EEE7', '#DDD6C8', '#E9E3D3']
export const CANOPY_TONES = ['#7FB069', '#6FA35B', '#8CBB73', '#5E9650']
export const GROUND_DAY = '#C9DDB4'
export const SIDEWALK_DAY = '#E7E5DE'

export function roofTone(t: number): string {
  return ROOF_TONES[Math.floor(t * ROOF_TONES.length) % ROOF_TONES.length]
}
export function canopyTone(t: number): string {
  return CANOPY_TONES[Math.floor(t * CANOPY_TONES.length) % CANOPY_TONES.length]
}
