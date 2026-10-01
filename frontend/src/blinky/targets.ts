import { explainerFor } from './catalogue'
import type { Rect } from './types'

export interface Target {
  id: string
  el: Element
}

/** The name tag for a target: its catalogue title. */
export function targetLabel(id: string): string {
  return explainerFor(id)?.title ?? 'Something'
}

const blinkyOwned = (el: Element) => el.closest('[data-blinky]') !== null

/** The explainable thing under a screen point, skipping Blinky's own layers. */
export function targetAt(x: number, y: number): Target | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (blinkyOwned(el)) continue
    const t = el.closest('[data-explain]')
    const id = t?.getAttribute('data-explain')
    if (t && id) return { id, el: t }
    return null
  }
  return null
}

/** Visible-ish targets in reading order, rows within 12 px counted as one row. */
export function orderTargets<T extends Rect & { id: string }>(rs: T[]): T[] {
  return rs
    .filter((r) => r.right - r.left > 0 && r.bottom - r.top > 0)
    .toSorted((a, b) => (Math.abs(a.top - b.top) <= 12 ? a.left - b.left : a.top - b.top))
}

/** Every explainable thing on screen, in reading order (the keyboard picker). */
export function allTargets(): Target[] {
  const els = [...document.querySelectorAll('[data-explain]')].filter((el) => !blinkyOwned(el))
  const rs = els.map((el, i) => {
    const r = el.getBoundingClientRect()
    return { id: String(i), left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })
  return orderTargets(rs).map((r) => {
    const el = els[Number(r.id)]
    return { id: el.getAttribute('data-explain') ?? '', el }
  })
}
