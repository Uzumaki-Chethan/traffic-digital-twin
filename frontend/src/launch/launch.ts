/**
 * "Get, set, go": the short signal screen shown while the console loads
 * after a link from the home page (Section 49). A tiny store, outside
 * React's tree, so the screen survives the route change underneath it.
 *
 * Timeline (ms from the click): red "Get" at 0 — the console route is
 * entered here, so its heavy first mount happens behind the red light —
 * amber "Set" at SET, green "Go" at GO. The screen fades only once BOTH
 * the green has shown for its moment AND the console has actually
 * committed (`arrived()`, called from the console's layout): React
 * Router runs navigations as transitions, which keep the home page on
 * screen until the console finishes rendering, so a fixed fade revealed
 * the home page on a slow load. A safety timeout fades it anyway.
 */

export type LaunchPhase = 'idle' | 'get' | 'set' | 'go' | 'out'

export const SET = 600
export const GO = 1200
export const OUT = 1750
export const DONE = 2150
/** Fade even if the console never reports in. */
export const GIVE_UP = 12000
const FADE = DONE - OUT

type Listener = () => void
let phase: LaunchPhase = 'idle'
const listeners = new Set<Listener>()
let timers: ReturnType<typeof setTimeout>[] = []
let landed = false
let greenDone = false

function set(p: LaunchPhase) {
  phase = p
  listeners.forEach((l) => l())
}

export function getPhase() {
  return phase
}

export function subscribe(l: Listener) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function fadeOut() {
  if (phase === 'out' || phase === 'idle') return
  set('out')
  timers.push(setTimeout(() => set('idle'), FADE))
}

/** Run the sequence; `go` performs the navigation (called at once, on red). */
export function launch(go: () => void) {
  if (phase !== 'idle') return
  timers.forEach(clearTimeout)
  landed = false
  greenDone = false
  set('get')
  // let the red light paint before the console's first mount takes the thread
  timers = [
    setTimeout(go, 60),
    setTimeout(() => set('set'), SET),
    setTimeout(() => set('go'), GO),
    setTimeout(() => {
      greenDone = true
      if (landed) fadeOut()
    }, OUT),
    setTimeout(fadeOut, GIVE_UP),
  ]
}

/** The console has committed to the screen (its layout calls this on mount). */
export function arrived() {
  landed = true
  if (greenDone) fadeOut()
}

/** For tests. */
export function reset() {
  timers.forEach(clearTimeout)
  timers = []
  landed = false
  greenDone = false
  set('idle')
}
