import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { Panel } from '@/ui/Panel'
import { Reveal } from '@/ui/Reveal'
import { ScenarioCard, type ScenarioUse } from '@/settings/ScenarioCard'
import { DEMO_SCENARIOS, scenarioName } from '@/data/scenarios'
import { useSettings, type Target } from '@/data/settings'
import { useRunStore } from '@/data/runState'

const TARGETS: { id: Target; label: string; lead: React.ReactNode }[] = [
  {
    id: 'overview',
    label: 'Overview · demo',
    lead: (
      <>
        What <Link to="/" className="underline decoration-[var(--rule-strong)] underline-offset-2">Overview</Link> runs
        when you press Start — one controller, Trinetra, watched live.
      </>
    ),
  },
  {
    id: 'performance',
    label: 'Performance · Trinetra vs VAC',
    lead: (
      <>
        What <Link to="/performance" className="underline decoration-[var(--rule-strong)] underline-offset-2">Performance</Link> runs:
        the same scenario twice, side by side — Trinetra on one, vehicle-actuated control on the other — scored on seven metrics.
      </>
    ),
  },
]

/**
 * Simulation Settings: the scenario library once, and a dropdown saying
 * which page the next click chooses for. Each card carries a mark for
 * the page(s) currently using it, so both choices stay readable without
 * switching the dropdown. A choice applies the next time that page's
 * Start is pressed — including the top bar's Start on this page, which
 * runs the chosen page's scenario and goes there; while a run of that
 * kind is active the cards are inert and the panel says so, rather than
 * silently queuing a change.
 */
export function SettingsPage() {
  const run = useRunStore((s) => s.state)
  const demoScenario = useSettings((s) => s.demoScenario)
  const evalScenario = useSettings((s) => s.evalScenario)
  const setDemo = useSettings((s) => s.setDemo)
  const setEval = useSettings((s) => s.setEval)
  const target = useSettings((s) => s.target)
  const setTarget = useSettings((s) => s.setTarget)

  const forOverview = target === 'overview'
  const selected = forOverview ? demoScenario : evalScenario
  const locked = run?.running === true && run.kind === (forOverview ? 'demo' : 'evaluation')
  const current = TARGETS.find((t) => t.id === target) ?? TARGETS[0]

  return (
    <div className="flex flex-col gap-2">
      <Reveal index={0}>
        <Panel
          title="Scenario"
          meta={
            locked
              ? 'Stop the current run to change'
              : <span>Selected: <span className="text-ink-strong">{scenarioName(selected)}</span></span>
          }
          bodyClassName="px-3 pb-3"
        >
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <span className="eyebrow">Choose for</span>
              <span className="relative">
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value as Target)}
                  className="appearance-none rounded-control border border-rule bg-plate py-1 pl-2.5 pr-7 text-[13px] font-medium text-ink-strong hover:border-[var(--rule-strong)]"
                >
                  {TARGETS.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-mute" />
              </span>
            </label>
            <p className="min-w-0 flex-1 text-[13px] leading-[1.55] text-ink">{current.lead}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {DEMO_SCENARIOS.map((s, i) => {
              const usedBy: ScenarioUse[] = []
              if (s.id === demoScenario) usedBy.push('overview')
              if (s.id === evalScenario) usedBy.push('performance')
              return (
                <ScenarioCard
                  key={s.id}
                  scenario={s}
                  index={i}
                  selected={s.id === selected}
                  disabled={locked}
                  usedBy={usedBy}
                  onSelect={() => (forOverview ? setDemo(s.id) : setEval(s.id))}
                />
              )
            })}
          </div>
        </Panel>
      </Reveal>
    </div>
  )
}
