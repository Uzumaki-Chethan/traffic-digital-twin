import { useEffect } from 'react'
import { create } from 'zustand'

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

async function refresh(signal?: AbortSignal): Promise<void> {
  try {
    const res = await fetch('/api/control/run-state', { signal })
    if (!res.ok) throw new Error(String(res.status))
    useRunStore.setState({ state: (await res.json()) as RunState })
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
    if (payload && 'available' in payload) useRunStore.setState({ state: payload })
    else void refresh()
  } catch (e: unknown) {
    useRunStore.setState({ failure: e instanceof Error ? e.message : String(e) })
  } finally {
    useRunStore.setState({ busy: false })
    // A start takes a few seconds to reach its first tick (SUMO launch +
    // model load), so confirm the real state shortly after.
    window.setTimeout(() => void refresh(), 600)
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
