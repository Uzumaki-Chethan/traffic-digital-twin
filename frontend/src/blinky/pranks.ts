import type { Anim, Gait, PrankId, Prop, Rect, Vec } from './types'
import { pick, type Rng } from './brain'

export interface PrankPlan {
  /** An optional first leg (e.g. teleport to the top of the scrollbar). */
  via?: { gait: Gait; to: Vec }
  gait: Gait
  to: Vec
  anim: Anim
  prop: Prop
  ms: number
  say?: string
  /** clip-path for Blinky's wrapper while the prank runs (looking "behind" something). */
  clip?: string
  /** Swap the prop partway through (the traffic cop's STOP -> GO). */
  swap?: { atMs: number; prop: Prop; say?: string }
  start?: () => void
  end?: () => void
}

/** Half the width of Blinky's tap target at rest size (0.35 × 44 px). */
export const REST_HIT_HALF = 15.4

/** Where the traffic cop stands: beside the run buttons (never under them), on the card below. */
export function copSpot(buttons: Rect, cardTop: number): Vec {
  return { x: buttons.left - REST_HIT_HALF - 20, y: cardTop }
}

const inView = (r: DOMRect) => r.width > 0 && r.top > 80 && r.bottom < window.innerHeight - 40
function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('main .glass-card')].filter((el) => inView(el.getBoundingClientRect()) && !el.matches(':hover'))
}
function cardTopBelow(y: number, x: number): number | null {
  let best: number | null = null
  for (const el of document.querySelectorAll('main .glass-card')) {
    const r = el.getBoundingClientRect()
    if (r.top >= y && x >= r.left && x <= r.right && (best === null || r.top < best)) best = r.top
  }
  return best
}

/**
 * One harmless prank (spec §6): where Blinky goes, what it does there, and
 * how it undoes itself. Null when the page has nothing suitable. Pranks
 * never cover data or controls and never take pointer events.
 */
export function planPrank(id: PrankId, rng: Rng): PrankPlan | null {
  switch (id) {
    case 'tug': {
      const c = cards()
      if (!c.length) return null
      const el = pick(rng, c)
      const r = el.getBoundingClientRect()
      return {
        gait: 'hop', to: { x: r.right - 22, y: r.top }, anim: 'hang', prop: null, ms: 1500, say: 'Heave-ho!',
        start: () => {
          el.animate([{ rotate: '0deg' }, { rotate: '-1.2deg' }, { rotate: '0.9deg' }, { rotate: '-0.5deg' }, { rotate: '0deg' }], { duration: 1200, easing: 'ease-in-out' })
        },
      }
    }
    case 'note': {
      const c = cards()
      if (!c.length) return null
      const r = pick(rng, c).getBoundingClientRect()
      let note: HTMLDivElement | null = null
      return {
        gait: 'hop', to: { x: r.right - 150, y: r.top }, anim: 'point', prop: null, ms: 4200, say: 'Hehe.',
        start: () => {
          note = document.createElement('div')
          note.className = 'blinky-note'
          note.textContent = 'Blinky was here ✌'
          note.style.left = `${r.right - 132}px`
          note.style.top = `${r.top - 18}px`
          document.body.appendChild(note)
        },
        end: () => {
          const n = note
          if (!n) return
          n.animate([{ opacity: 1, transform: 'rotate(-4deg)' }, { opacity: 0, transform: 'rotate(8deg) translateY(10px)' }], { duration: 500, fill: 'forwards' }).onfinish = () => n.remove()
        },
      }
    }
    case 'peekaboo': {
      const c = cards()
      if (!c.length) return null
      const r = pick(rng, c).getBoundingClientRect()
      return { gait: 'teleport', to: { x: r.left - 4, y: r.top + Math.min(150, r.height - 10) }, anim: 'peek', prop: null, ms: 3500, say: 'Peekaboo!', clip: 'inset(0 50% 0 0)' }
    }
    case 'cop': {
      const btn = document.querySelector('header .run-go, header .run-hold, header .run-halt')
      if (!btn) return null
      // The whole run-button group, so the cop stands clear of all of them.
      const r = (btn.parentElement ?? btn).getBoundingClientRect()
      const top = cardTopBelow(r.bottom, r.left - 40)
      if (top === null) return null
      return {
        gait: 'fly', to: copSpot(r, top), anim: 'present', prop: 'sign-stop', ms: 3600, say: 'Stop!',
        swap: { atMs: 1800, prop: 'sign-go', say: '…Go!' },
      }
    }
    case 'lever': {
      const pill = document.querySelector('header .scenario-pill')
      if (!pill) return null
      const r = pill.getBoundingClientRect()
      return { gait: 'fly', to: { x: r.left + r.width * 0.7, y: r.bottom + 50 }, anim: 'hang', prop: null, ms: 2600, say: 'Wheee, a lever!' }
    }
    case 'slide': {
      const m = document.querySelector('main')?.getBoundingClientRect()
      if (!m) return null
      return {
        via: { gait: 'teleport', to: { x: m.right - 14, y: m.top + 70 } },
        gait: 'slide', to: { x: m.right - 14, y: m.bottom - 8 }, anim: 'cheer', prop: null, ms: 900, say: 'Wheeeee!',
      }
    }
    case 'lift': {
      const tiles = [...document.querySelectorAll<HTMLElement>('main [data-explain^="kpi-"]')].filter((el) => inView(el.getBoundingClientRect()))
      if (!tiles.length) return null
      const tile = pick(rng, tiles)
      const icon = tile.querySelector<HTMLElement>('span[aria-hidden]')
      const tr = tile.getBoundingClientRect()
      const ir = icon?.getBoundingClientRect() ?? tr
      return {
        gait: 'hop', to: { x: ir.left + ir.width / 2, y: tr.top }, anim: 'lift', prop: null, ms: 2400, say: 'So strong!',
        start: () => {
          icon?.animate([{ translate: '0 0' }, { translate: '0 -10px' }, { translate: '0 0' }], { duration: 800, iterations: 3, easing: 'ease-in-out' })
        },
      }
    }
    case 'hide': {
      const logo = document.querySelector('aside a[aria-label^="Trinetra"] img')
      if (!logo) return null
      const r = logo.getBoundingClientRect()
      return { gait: 'teleport', to: { x: r.right - 12, y: r.bottom - 6 }, anim: 'peek', prop: null, ms: 3200, say: 'Can’t see me!', clip: 'inset(0 0 0 48%)' }
    }
  }
}
