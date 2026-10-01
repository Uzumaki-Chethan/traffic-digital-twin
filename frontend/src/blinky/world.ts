import type { Platform, Rect, Vec } from './types'

/** Blinky's standing height at rest (44 px) plus a little air. */
export const BLINKY_CLEARANCE = 46
export const MIN_SEGMENT = 70

export interface Box extends Rect {
  id: string
}

function subtract([a, b]: [number, number], [c, d]: [number, number]): [number, number][] {
  if (d <= a || c >= b) return [[a, b]]
  const out: [number, number][] = []
  if (c > a) out.push([a, c])
  if (d < b) out.push([d, b])
  return out
}

/**
 * The stretches of card top edges Blinky may stand on: inside the scrolling
 * frame (`view`), at least 56 px below its top, and only where nothing sits
 * within BLINKY_CLEARANCE above — so a standing Blinky never covers the card
 * above it. Each surviving stretch is one Platform `<boxId>#<n>`.
 */
export function platformsFrom(boxes: Box[], view: Rect): Platform[] {
  const out: Platform[] = []
  for (const b of boxes) {
    if (b.top < view.top + 56 || b.top > view.bottom - 12) continue
    let segs: [number, number][] = [[Math.max(b.left + 16, view.left), Math.min(b.right - 16, view.right)]]
    for (const o of boxes) {
      if (o === b) continue
      const inBand = o.bottom > b.top - BLINKY_CLEARANCE && o.top < b.top
      if (inBand) segs = segs.flatMap((s) => subtract(s, [o.left - 20, o.right + 20]))
    }
    segs
      .filter(([a, c]) => c - a >= MIN_SEGMENT)
      .forEach(([a, c], i) => out.push({ id: `${b.id}#${i}`, kind: 'card', x1: a, x2: c, y: b.top }))
  }
  return out
}

/** The first platform at or below `p` that spans its x. */
export function platformUnder(ps: Platform[], p: Vec): Platform | null {
  return ps
    .filter((q) => q.y >= p.y - 2 && p.x >= q.x1 && p.x <= q.x2)
    .reduce<Platform | null>((best, q) => (best === null || q.y < best.y ? q : best), null)
}

/** The platform closest to `p` (to its nearest point), whatever it is. */
export function nearestPlatform(ps: Platform[], p: Vec): Platform | null {
  let best: Platform | null = null
  let bestD = Infinity
  for (const q of ps) {
    const x = Math.min(q.x2, Math.max(q.x1, p.x))
    const d = Math.hypot(x - p.x, q.y - p.y)
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best
}

/**
 * Standing spots inside a card's title row: the empty stretch between the
 * title and its right-hand meta, feet 6 px above the row's bottom. The row
 * (54 px) is taller than Blinky, so it covers nothing — the only place to
 * stand when cards are packed 14 px apart (Section 38). `blocks` are the
 * row's own contents. Ids are `<boxId>~h#<n>`.
 */
export function headerPlatforms(id: string, header: Rect, blocks: Box[], view: Rect): Platform[] {
  const y = header.bottom - 6
  if (y - BLINKY_CLEARANCE < view.top + 8 || y > view.bottom - 12) return []
  let segs: [number, number][] = [[Math.max(header.left + 18, view.left), Math.min(header.right - 18, view.right)]]
  for (const b of blocks) segs = segs.flatMap((s) => subtract(s, [b.left - 12, b.right + 12]))
  return segs.filter(([a, c]) => c - a >= MIN_SEGMENT).map(([a, c], i) => ({ id: `${id}~h#${i}`, kind: 'card' as const, x1: a, x2: c, y }))
}
