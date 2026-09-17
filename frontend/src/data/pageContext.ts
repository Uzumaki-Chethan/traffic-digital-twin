import { useLocation } from 'react-router-dom'
import { useRunStore } from './runState'
import { useSettings, type Target } from './settings'
import { scenarioName } from './scenarios'

/**
 * What the page being read is ABOUT, for the bars that frame every page:
 * which kind of run it shows, which scenario that run is (the running
 * one if it is up, otherwise the Settings choice), and where its run
 * lives. The top bar's controls, its subtitle and the footer all read
 * this rather than each deciding for themselves.
 *
 *   Overview, Analytics   the demo run
 *   Performance           the evaluation
 *   Simulation Settings   whichever page its "Choose for" dropdown names
 */

export type RunKind = 'demo' | 'evaluation'

export interface PageContext {
  path: string
  /** The page's name, as the nav rail spells it. */
  name: string
  /** The kind of run this page shows. */
  kind: RunKind
  /** Where that kind of run is watched. */
  home: '/' | '/performance'
  /** Scenario id the page's Start would run, or is running. */
  scenario: string
  /** Its plain-language name. */
  scenarioLabel: string
  /** True when a run of THIS page's kind is up. */
  running: boolean
  /** True when a run of the OTHER kind is up. */
  otherRunning: boolean
}

const NAMES: { path: string; name: string }[] = [
  { path: '/analytics', name: 'Analytics' },
  { path: '/performance', name: 'Performance' },
  { path: '/decisions', name: 'Decisions' },
  { path: '/settings', name: 'Simulation Settings' },
  { path: '/', name: 'Overview' },
]

export function kindOf(pathname: string, target: Target): RunKind {
  if (pathname.startsWith('/performance')) return 'evaluation'
  if (pathname.startsWith('/settings')) return target === 'performance' ? 'evaluation' : 'demo'
  return 'demo'
}

export function usePageContext(): PageContext {
  const { pathname } = useLocation()
  const run = useRunStore((s) => s.state)
  const target = useSettings((s) => s.target)
  const demoScenario = useSettings((s) => s.demoScenario)
  const evalScenario = useSettings((s) => s.evalScenario)

  const kind = kindOf(pathname, target)
  const chosen = kind === 'evaluation' ? evalScenario : demoScenario
  // A backend without `kind` (python app.py) hosts one run and nothing
  // else; read it as this page's own.
  const runKind: RunKind | null = run?.running ? (run.kind ?? kind) : null
  const running = runKind === kind
  const scenario = running && run?.scenario ? run.scenario : chosen

  return {
    path: pathname,
    name: NAMES.find((n) => (n.path === '/' ? pathname === '/' : pathname.startsWith(n.path)))?.name ?? 'Trinetra',
    kind,
    home: kind === 'evaluation' ? '/performance' : '/',
    scenario,
    scenarioLabel: scenarioName(scenario),
    running,
    otherRunning: runKind !== null && runKind !== kind,
  }
}
