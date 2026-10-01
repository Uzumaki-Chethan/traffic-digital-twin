import { platformsFrom, type Box } from './world'
import type { Platform, Rect } from './types'

let seq = 0
const ids = new WeakMap<Element, string>()
function idOf(el: Element): string {
  let id = ids.get(el)
  if (!id) {
    id = `c${++seq}`
    ids.set(el, id)
  }
  return id
}

export interface WorldRead {
  platforms: Platform[]
  /** Platform id -> the card element it belongs to (for anchoring). */
  elementOf: Map<string, Element>
  /** The scrolling page frame. */
  main: Rect | null
  /** The Digital twin card's platform, when it has one. */
  twinPerch: Platform | null
}

/** Read the live page into platforms. Cheap; called a few times a second. */
export function readWorld(): WorldRead {
  const mainEl = document.querySelector('main')
  const m = mainEl?.getBoundingClientRect()
  const main = m ? { left: m.left, top: m.top, right: m.right, bottom: m.bottom } : null
  const boxes: Box[] = []
  const byId = new Map<string, Element>()
  document.querySelectorAll('main .glass-card').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return
    const id = idOf(el)
    byId.set(id, el)
    boxes.push({ id, left: r.left, top: r.top, right: r.right, bottom: r.bottom })
  })
  const platforms = main ? platformsFrom(boxes, main) : []
  const elementOf = new Map<string, Element>()
  for (const p of platforms) {
    const el = byId.get(p.id.split('#')[0])
    if (el) elementOf.set(p.id, el)
  }
  const twin = document.querySelector('main [data-explain="twin"]')
  const twinPerch = twin ? (platforms.find((p) => elementOf.get(p.id) === twin) ?? null) : null
  return { platforms, elementOf, main, twinPerch }
}
