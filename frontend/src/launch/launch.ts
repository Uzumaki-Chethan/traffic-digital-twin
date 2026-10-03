/**
 * "Get, set, go": the short signal screen shown while the console loads
 * after a link from the home page (Section 49). A tiny store, outside
 * React's tree, so the screen survives the route change underneath it.
 *
 * Timeline (ms from the click): red "Get" at 0 — the console route is
 * entered here, so its heavy first mount happens behind the red light —
 * amber "Set" at SET, green "Go" at GO, then the screen fades (OUT) and is
 * gone at DONE. Nothing's correctness depends on it: the navigation has
 * already happened by the time the lights change.
 */

export type LaunchPhase = 'idle' | 'get' | 'set' | 'go' | 'out'

export const SET = 600
export const GO = 1200
export const OUT = 1750
export const DONE = 2150

type Listener = () => void
let phase: LaunchPhase = 'idle'
const listeners = new Set<Listener>()
let timers: ReturnType<typeof setTimeout>[] = []

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

/** Run the sequence; `go` performs the navigation (called at once, on red). */
export function launch(go: () => void) {
  if (phase !== 'idle') return
  timers.forEach(clearTimeout)
  set('get')
  // let the red light paint before the console's first mount takes the thread
  timers = [
    setTimeout(go, 60),
    setTimeout(() => set('set'), SET),
    setTimeout(() => set('go'), GO),
    setTimeout(() => set('out'), OUT),
    setTimeout(() => set('idle'), DONE),
  ]
}

/** For tests. */
export function reset() {
  timers.forEach(clearTimeout)
  timers = []
  set('idle')
}
