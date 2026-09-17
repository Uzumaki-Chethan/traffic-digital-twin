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
  /** What the console's worker is running (2026-09-14): a demo run, an
   * evaluation (Trinetra vs a baseline, see the Performance page), or
   * nothing. Only the console reports it. */
  kind?: 'demo' | 'evaluation' | null
  /** Scenario id of the current (or last) run — "default" is the
   * production route. Never shown raw; data/scenarios.ts names it. */
  scenario?: string | null
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

async function refresh(signal?: AbortSignal): Promise<void> {
  try {
    const res = await fetch('/api/control/run-state', { signal })
    if (!res.ok) throw new Error(String(res.status))
    const state = (await res.json()) as RunState
    noteRun(state)
    useRunStore.setState({ state })
  } catch {
    if (signal?.aborted) return
    // Server down or no control layer mounted: report nothing rather
    // than showing controls that cannot work.
    useRunStore.setState({ state: null })
  }
}

async function send(path: string, body?: unknown): Promise<void> {
  useRunStore.setState({ busy: true, failure: null })
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
    useRunStore.setState({ busy: false })
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
    return () => {
      ctrl.abort()
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])
}
