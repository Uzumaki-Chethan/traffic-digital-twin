import { create } from 'zustand'
import { DEFAULT_SCENARIO, DEMO_SCENARIOS, EVAL_SCENARIOS } from './scenarios'

/**
 * Which scenario each page runs, chosen on the Simulation Settings page
 * and applied the next time that page's Start is pressed. Kept in this
 * browser (localStorage) — it is a viewer preference, not simulation
 * state, so it never goes near the backend until a start request.
 */

const KEY_DEMO = 'trinetra.settings.demoScenario'
const KEY_EVAL = 'trinetra.settings.evalScenario'

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
  setDemo: (id: string) => void
  setEval: (id: string) => void
}

const DEMO_IDS = new Set(DEMO_SCENARIOS.map((s) => s.id))
const EVAL_IDS = new Set(EVAL_SCENARIOS.map((s) => s.id))

export const useSettings = create<SettingsState>((set) => ({
  demoScenario: read(KEY_DEMO, DEMO_IDS, DEFAULT_SCENARIO.id),
  evalScenario: read(KEY_EVAL, EVAL_IDS, 'extreme_seed1'),
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
}))
