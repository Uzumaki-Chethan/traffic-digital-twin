/**
 * The morning city behind the home page (Section 48): one deterministic
 * layout (fixed seed), so it is the same city on every visit.
 *
 * World metres: x east, z south, y up; junction C at the origin. Roads run
 * every 120 m both ways; the two through the junction are the wide ones.
 * Pure data, no three.js — the scene (MorningCity.tsx) draws it and the
 * tests check it.
 */

export const GRID = 120
/** Roads that carry traffic and have signals: the inner grid. */
export const ROADS = [-480, -360, -240, -120, 0, 120, 240, 360, 480]
/** Every road drawn, out into the morning haze. */
export const ALL_ROADS = Array.from({ length: 19 }, (_, i) => -1080 + i * GRID)
/** Carriageway half-widths: the junction's two roads, and the rest. */
export const MAIN_HALF = 11
export const MINOR_HALF = 6
export const SIDEWALK = 4
/** Street trees stand this far beyond the sidewalk. */
export const TREE_OFFSET = 1.6
/** Nothing is built closer to the sidewalk than this. */
const VERGE = 4.5
/** The inner grid's extent: everything inside is detailed and casts shadows. */
export const INNER = 480

export const roadHalf = (c: number) => (c === 0 ? MAIN_HALF : MINOR_HALF)
/** From a road's centre line to where building lots may start. */
const lotStart = (c: number) => roadHalf(c) + SIDEWALK + VERGE

export type BoxKind = 'tower' | 'podium' | 'roofUnit'

export interface Box {
  /** Footprint centre and size. */
  x: number
  z: number
  w: number
  d: number
  /** Height, and the height it stands on (a roof unit stands on a roof). */
  h: number
  y: number
  kind: BoxKind
  /** 0–1: picks the wall and roof tone. */
  tone: number
  /** A glass curtain-wall tower. */
  glass: boolean
  /** Casts a sun shadow: the inner city only (the far skyline is haze). */
  casts: boolean
}

export interface Tree {
  x: number
  z: number
  /** Canopy radius and trunk height. */
  r: number
  h: number
  /** 0–1: picks the canopy shade. */
  tone: number
}

/** A park block: lawn and trees, no buildings, two paths crossing. */
export interface Park {
  x0: number
  z0: number
  x1: number
  z1: number
}

export interface CityLayout {
  boxes: Box[]
  trees: Tree[]
  parks: Park[]
}

export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Blocks given over to parks, by their north-west corner. */
const PARK_CORNERS: [number, number][] = [
  [120, 0],
  [-240, -240],
  [240, 360],
  [-360, 240],
]

export function buildCity(seed = 20261002): CityLayout {
  const r = rng(seed)
  const boxes: Box[] = []
  const trees: Tree[] = []
  const parks: Park[] = []

  for (let i = 0; i < ALL_ROADS.length - 1; i++) {
    for (let j = 0; j < ALL_ROADS.length - 1; j++) {
      const a = ALL_ROADS[i]
      const b = ALL_ROADS[i + 1]
      const c = ALL_ROADS[j]
      const e = ALL_ROADS[j + 1]
      const inner = a >= -INNER && b <= INNER && c >= -INNER && e <= INNER

      if (inner && PARK_CORNERS.some(([px, pz]) => px === a && pz === c)) {
        const park = { x0: a + roadHalf(a) + SIDEWALK, z0: c + roadHalf(c) + SIDEWALK, x1: b - roadHalf(b) - SIDEWALK, z1: e - roadHalf(e) - SIDEWALK }
        parks.push(park)
        const cx = (park.x0 + park.x1) / 2
        const cz = (park.z0 + park.z1) / 2
        for (let k = 0; k < 34; k++) {
          const x = park.x0 + 6 + r() * (park.x1 - park.x0 - 12)
          const z = park.z0 + 6 + r() * (park.z1 - park.z0 - 12)
          // clear of the two paths
          if (Math.abs(x - cx) < 6 || Math.abs(z - cz) < 6) continue
          trees.push({ x, z, r: 3 + r() * 2.4, h: 4 + r() * 3, tone: r() })
        }
        continue
      }

      const x0 = a + lotStart(a)
      const x1 = b - lotStart(b)
      const z0 = c + lotStart(c)
      const z1 = e - lotStart(e)
      // the four blocks round the junction stay low so it stays in view
      const near = inner && Math.abs(a + 60) < 70 && Math.abs(c + 60) < 70
      const dist = Math.hypot((a + b) / 2, (c + e) / 2)
      // outer blocks in front of the opening view stay low too
      const south = !inner && c >= INNER
      const nx = r() < 0.5 ? 2 : 3
      const nz = r() < 0.5 ? 2 : 3
      const lw = (x1 - x0) / nx
      const ld = (z1 - z0) / nz
      for (let lx = 0; lx < nx; lx++) {
        for (let lz = 0; lz < nz; lz++) {
          // some lots stay open: a plaza, a car park
          if (r() < (inner ? 0.12 : 0.3)) continue
          const mx = 1.5 + r() * 3
          const mz = 1.5 + r() * 3
          let w = lw - 2 * mx
          let d = ld - 2 * mz
          const x = x0 + lw * (lx + 0.5)
          const z = z0 + ld * (lz + 0.5)
          let h: number
          if (!inner) h = south ? 12 + r() * 24 : 40 + r() ** 2.2 * 230
          else if (near) h = 10 + r() ** 1.6 * 34
          else h = 14 + r() ** 2.2 * (60 + Math.min(1, dist / 400) * 150)
          const tone = r()
          const glass = h > 70 && r() < 0.45
          if (inner && h > 60) {
            // a podium under the tower
            boxes.push({ x, z, w, d, h: 8 + r() * 6, y: 0, kind: 'podium', tone, glass: false, casts: true })
            w *= 0.62 + r() * 0.15
            d *= 0.62 + r() * 0.15
          }
          boxes.push({ x, z, w, d, h, y: 0, kind: 'tower', tone, glass, casts: inner })
          if (inner && !glass && h < 70 && r() < 0.55) {
            const uw = 3 + r() * 5
            const ud = 3 + r() * 5
            boxes.push({
              x: x + (r() - 0.5) * (w - uw) * 0.8,
              z: z + (r() - 0.5) * (d - ud) * 0.8,
              w: uw,
              d: ud,
              h: 2.5 + r() * 2.5,
              y: h,
              kind: 'roofUnit',
              tone: r(),
              glass: false,
              casts: true,
            })
          }
        }
      }
    }
  }

  // Street trees: along every inner road, and the junction's two roads all
  // the way out; clear of every crossing.
  for (const c of ALL_ROADS) {
    const extent = c === 0 ? 1080 : Math.abs(c) <= INNER ? INNER : 0
    if (!extent) continue
    const off = roadHalf(c) + SIDEWALK + TREE_OFFSET
    for (const axis of ['x', 'z'] as const) {
      for (const side of [-1, 1]) {
        for (let s = -extent; s <= extent; s += 11 + r() * 3) {
          const crossing = Math.round(s / GRID) * GRID
          if (Math.abs(s - crossing) < roadHalf(crossing) + SIDEWALK + 6) continue
          if (r() < 0.18) continue
          const lateral = c + side * off
          trees.push({ x: axis === 'x' ? s : lateral, z: axis === 'x' ? lateral : s, r: 2.2 + r() * 1.4, h: 3 + r() * 2, tone: r() })
        }
      }
    }
  }

  return { boxes, trees, parks }
}
