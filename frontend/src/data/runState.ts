import { useEffect } from 'react'
import { create } from 'zustand'
import { useSim } from './store'

/**
 * What the backend will let us do to the simulation, and the calls that
 * do it — `GET /api/control/run-state` plus the POSTs beside it in
 * backend/services/control_routes.py.
 *
 * Capability is DISCOVERED, never assumed, because the same frontend is
 * served by two different backends:
 *
 *   python server.py   the console — outlives any simulation, so it can
 *                      start one (`can_start`, `managed: true`)
 *   python app.py      the dashboard runs inside the simulation, so it
 *                      can pause/stop but has nothing to start
 *
 * and by a third that can do neither (the evaluator's own read-only
 * dashboard, which reports `available: false`). Every control in the UI
 * is driven by these flags rather than by hope.
 */

export interface RunState {
  /** False when nothing here is attached to a run loop at all. */
  available: boolean
  /** True when a supervisor can start runs — i.e. this is the console. */
  managed: boolean
  running: boolean
  can_start: boolean
  paused: boolean
  stopping: boolean
  /** Simulated seconds per wall-clock second; null means unthrottled. */
  speed: number | null
  gui?: boolean
  /** True between asking for a SUMO window and it actually opening. */
  handing_over?: boolean
  /** Set when the last run ended by crashing, in plain text. */
  error?: string | null
  /** ISO time the current (or last) run was started; changes on every new run. */
  started_at?: string | null
  /** Emergency vehicles dispatched into this run from the console (2026-09-18). */
  dispatched?: number
  /** Vehicles stalled into this run on demand — an ad hoc accident, on
   * whichever lane was chosen (2026-09-20). */
  incidents?: number
  /** What the console's worker is running (2026-09-14): a demo run, an
   * evaluation (Trinetra vs a baseline, see the Performance page), or
   * nothing. Only the console reports it. */
  kind?: 'demo' | 'evaluation' | null
  /** Scenario id of the current (or last) run — "default" is the
   * production route. Never shown raw; data/scenarios.ts names it. */
  scenario?: string | null
  /** The physical model's USB link (Section 50): is one running, is the
   * board answering, on which port. Absent from older backends. */
  rig?: { enabled: boolean; connected: boolean; port: string | null }
}

interface Store {
  state: RunState | null
  /** True while a control request is in flight. */
  busy: boolean
  /** Set when a control request itself failed. */
  failure: string | null
}

export const useRunStore = create<Store>(() => ({ state: null, busy: false, failure: null }))

const POLL_MS = 2000

/** `started_at` of the run the sim store's frames belong to. */
let knownStart: string | null | undefined

/**
 * A new run means the frames on screen belong to a run that no longer
 * exists. Forget them here, the moment the console reports the start,
 * rather than when the new run's first tick arrives 4-6 s later (SUMO
 * launch + model load) — otherwise the old vehicles stand on the plate
 * for those seconds and then slide "backwards" into the new positions.
 */
function noteRun(state: RunState): void {
  const start = state.started_at ?? null
  if (knownStart !== undefined && start !== knownStart) useSim.getState().reset()
  knownStart = start
}

/** A poll that hasn't answered in this long is abandoned, not waited on. */
const POLL_TIMEOUT_MS = 3000
/** Consecutive failed polls before the controls are withdrawn (~6 s). */
const FAILS_BEFORE_CLEAR = 3
let inFlight = false
let failures = 0

/**
 * Ask the console what it's doing. Hardened (Section 37.11) after the top
 * bar was seen to lose every button until a page refresh: a poll could
 * hang with no timeout, polls could pile up behind it, and ONE failure
 * wiped the known state. Now each poll times out, never overlaps another,
 * and the last good state stands until several polls in a row have failed.
 */
async function refresh(signal?: AbortSignal): Promise<void> {
  if (inFlight) return
  inFlight = true
  const timeout = new AbortController()
  const timer = window.setTimeout(() => timeout.abort(), POLL_TIMEOUT_MS)
  const onOuterAbort = () => timeout.abort()
  signal?.addEventListener('abort', onOuterAbort)
  try {
    const res = await fetch('/api/control/run-state', { signal: timeout.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const state = (await res.json()) as RunState
    failures = 0
    noteRun(state)
    useRunStore.setState({ state })
  } catch {
    if (signal?.aborted) return
    // Server down or no control layer mounted: report nothing rather
    // than showing controls that cannot work — but only once it has
    // failed several times running, not on one slow or dropped reply.
    failures++
    if (failures >= FAILS_BEFORE_CLEAR) useRunStore.setState({ state: null })
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
    inFlight = false
  }
}

/**
 * POST a control request. `busy` greys out the run controls while it is in
 * flight, which is right for start/stop/pause; `quiet` skips that for the
 * one-shot actions (dispatch, stall) that don't change the run's state,
 * so pressing Send doesn't make Pause and Stop blink.
 */
async function send(path: string, body?: unknown, quiet = false): Promise<void> {
  if (quiet) useRunStore.setState({ failure: null })
  else useRunStore.setState({ busy: true, failure: null })
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = (await res.json().catch(() => null)) as (RunState & { detail?: string }) | null
    if (!res.ok) {
      useRunStore.setState({ failure: payload?.detail ?? `HTTP ${res.status}` })
      return
    }
    if (payload && 'available' in payload) {
      noteRun(payload)
      useRunStore.setState({ state: payload })
    } else void refresh()
  } catch (e: unknown) {
    useRunStore.setState({ failure: e instanceof Error ? e.message : String(e) })
  } finally {
    if (!quiet) useRunStore.setState({ busy: false })
    // A start takes a few seconds to reach its first tick (SUMO launch +
    // model load), so confirm the real state shortly after.
    window.setTimeout(() => void refresh(), 600)
  }
}

/** How long to wait for a stopped run to report idle before giving up. */
const SWITCH_TIMEOUT_MS = 20_000

/**
 * End whatever the console is running, wait for it to report idle, then
 * start `next`. The console runs one thing at a time and refuses a
 * second start with a 409, so a page whose kind of run is not the one
 * up (Start on Performance during a demo, or the reverse) does this
 * instead of asking the reader to go and stop it themselves. `busy`
 * is held for the whole sequence so nothing else is pressed mid-way.
 */
async function replace(next: () => Promise<void>): Promise<void> {
  useRunStore.setState({ busy: true, failure: null })
  try {
    if (useRunStore.getState().state?.running) {
      await send('/api/control/stop-simulation')
      const t0 = performance.now()
      while (useRunStore.getState().state?.running) {
        if (performance.now() - t0 > SWITCH_TIMEOUT_MS) {
          useRunStore.setState({ failure: 'The previous run did not stop in time' })
          return
        }
        await new Promise((r) => window.setTimeout(r, 300))
        await refresh()
      }
    }
    await next()
  } finally {
    useRunStore.setState({ busy: false })
  }
}

export const runControl = {
  /** Console: start a demo run of `scenarioName` (data/scenarios.ts ids;
   * "default" = the production route, sent as no scenario at all). */
  start: (gui: boolean, scenarioName = 'default') =>
    send('/api/control/start-simulation',
      scenarioName === 'default' ? { gui } : { gui, scenario_name: scenarioName }),
  /** Console: start Trinetra vs VAC on `scenarioName`, in-process, headless. */
  startEvaluation: (scenarioName: string) =>
    send('/api/control/start-evaluation', { scenario_name: scenarioName, baseline: 'vac' }),
  /** Console: end the current run (if any), then start a demo run. */
  replaceWithDemo: (gui: boolean, scenarioName: string) =>
    replace(() => runControl.start(gui, scenarioName)),
  /** Console: end the current run (if any), then start an evaluation. */
  replaceWithEvaluation: (scenarioName: string) =>
    replace(() => runControl.startEvaluation(scenarioName)),
  /** Console: end the run the supervisor is hosting. */
  stop: () => send('/api/control/stop-simulation'),
  /** Send an emergency vehicle into the running simulation (both sides of an evaluation). */
  dispatch: (vehicleType: string, approach: string, turn: string) =>
    send('/api/control/dispatch', { vehicle_type: vehicleType, approach, turn }, true),
  /** Stall a vehicle on the chosen lane — an ad hoc accident, on demand
   * (both sides of an evaluation). */
  stall: (vehicleType: string, approach: string, turn: string) =>
    send('/api/control/dispatch-incident', { vehicle_type: vehicleType, approach, turn }, true),
  /**
   * Continue the running simulation in a SUMO window. Not a restart: the
   * run saves its state and resumes from it, so the same vehicles and
   * signal carry across. Takes a second or two while SUMO relaunches.
   */
  openGui: () => send('/api/control/open-gui'),
  /**
   * app.py: ask its own run loop to finish. Same graceful stop, but this
   * is the endpoint that exists when there is no supervisor — and there
   * is no way back from it, because that process ends with the run.
   */
  halt: () => send('/api/control/stop'),
  pause: () => send('/api/control/pause'),
  resume: () => send('/api/control/resume'),
  setSpeed: (multiplier: number | null) => send('/api/control/speed', { multiplier }),
  refresh: () => refresh(),
}

/** Mount exactly once (App.tsx). Everything else reads the store. */
export function useRunStatePoll(): void {
  useEffect(() => {
    const ctrl = new AbortController()
    // Deferred by a tick so the first poll cannot set state during mount.
    const first = window.setTimeout(() => void refresh(ctrl.signal), 0)
    const id = window.setInterval(() => void refresh(), POLL_MS)
    // Coming back to the tab (timers are throttled in the background):
    // ask at once rather than showing a stale bar until the next tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      ctrl.abort()
      clearTimeout(first)
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])
}

// This module owns app-wide singletons (the store, the poller's state). A
// hot swap in the dev server would give the page a fresh, empty store
// while the old poller kept feeding the old one — the run controls then
// vanish until a reload. So an edit here reloads the page instead.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())
