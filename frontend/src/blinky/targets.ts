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

interface Hit<E> {
  closest(selector: string): E | null
  getAttribute(name: string): string | null
}

/**
 * What a release over these elements (topmost first) explains. Released over
 * Blinky itself or its dock: nothing — not the card behind it. (Blinky's
 * decorative layers take no pointer events, so they never appear here.)
 */
export function pickTarget<E extends Hit<E>>(els: E[]): { id: string; el: E } | null {
  const first = els[0]
  if (!first || first.closest('[data-blinky]')) return null
  const t = first.closest('[data-explain]')
  const id = t?.getAttribute('data-explain')
  return t && id ? { id, el: t } : null
}

/** The explainable thing under a screen point. */
export function targetAt(x: number, y: number): Target | null {
  return pickTarget(document.elementsFromPoint(x, y))
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
