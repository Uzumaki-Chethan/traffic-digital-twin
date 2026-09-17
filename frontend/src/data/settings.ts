import { create } from 'zustand'
import { DEFAULT_DEMO_SCENARIO, DEFAULT_EVAL_SCENARIO, DEMO_SCENARIOS, EVAL_SCENARIOS } from './scenarios'

/**
 * Which scenario each page runs, chosen on the Simulation Settings page
 * and applied the next time that page's Start is pressed — plus which
 * page that Settings page is currently choosing for, because the top
 * bar's Start on Settings runs (and goes to) that page. Kept in this
 * browser (localStorage) — it is a viewer preference, not simulation
 * state, so it never goes near the backend until a start request.
 */

/** The page a Settings choice is being made for. */
export type Target = 'overview' | 'performance'

const KEY_DEMO = 'trinetra.settings.demoScenario'
const KEY_EVAL = 'trinetra.settings.evalScenario'
const KEY_TARGET = 'trinetra.settings.target'

function read(key: string, allowed: Set<string>, fallback: string): string {
  try {
    const v = window.localStorage.getItem(key)
    return v !== null && allowed.has(v) ? v : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private mode / blocked storage: the choice still applies for this page load.
  }
}

interface SettingsState {
  demoScenario: string
  evalScenario: string
  target: Target
  setDemo: (id: string) => void
  setEval: (id: string) => void
  setTarget: (target: Target) => void
}

const DEMO_IDS = new Set(DEMO_SCENARIOS.map((s) => s.id))
const EVAL_IDS = new Set(EVAL_SCENARIOS.map((s) => s.id))
const TARGETS = new Set<string>(['overview', 'performance'])

export const useSettings = create<SettingsState>((set) => ({
  demoScenario: read(KEY_DEMO, DEMO_IDS, DEFAULT_DEMO_SCENARIO),
  evalScenario: read(KEY_EVAL, EVAL_IDS, DEFAULT_EVAL_SCENARIO),
  target: read(KEY_TARGET, TARGETS, 'overview') as Target,
  setDemo: (id) => {
    if (!DEMO_IDS.has(id)) return
    write(KEY_DEMO, id)
    set({ demoScenario: id })
  },
  setEval: (id) => {
    if (!EVAL_IDS.has(id)) return
    write(KEY_EVAL, id)
    set({ evalScenario: id })
  },
  setTarget: (target) => {
    write(KEY_TARGET, target)
    set({ target })
  },
}))
