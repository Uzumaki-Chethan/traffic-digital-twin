import { useSyncExternalStore } from 'react'

/**
 * The decorative signal heads' shared clock (Section 51): every panel
 * glyph that does NOT show a real signal state shows a random lamp,
 * re-drawn every PERIOD on the same beat across the whole console. The
 * lamp is a pure function of (the glyph's own key, the beat), so a
 * re-render never flickers it and every head changes together.
 */

export const PERIOD = 30_000
const LAMPS = ['red', 'amber', 'green'] as const
export type Lamp = (typeof LAMPS)[number]

/** Same key and beat, same lamp; a new beat re-draws it. */
export function lampFor(key: string, beat: number): Lamp {
  let h = 2166136261 ^ beat
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return LAMPS[(h >>> 0) % LAMPS.length]
}

const beatNow = () => Math.floor(Date.now() / PERIOD)
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

function schedule() {
  // wake exactly on the next beat boundary
  timer = setTimeout(() => {
    listeners.forEach((l) => l())
    schedule()
  }, PERIOD - (Date.now() % PERIOD) + 20)
}

function subscribe(l: () => void) {
  listeners.add(l)
  if (!timer) schedule()
  return () => {
    listeners.delete(l)
    if (!listeners.size && timer) {
      clearTimeout(timer)
      timer = null
    }
  }
}

/** The current beat; re-renders the caller when it changes. */
export function useBeat() {
  return useSyncExternalStore(subscribe, beatNow, beatNow)
}
