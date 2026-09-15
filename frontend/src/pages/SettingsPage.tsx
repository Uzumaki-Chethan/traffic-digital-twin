import { Link } from 'react-router-dom'
import { Panel } from '@/ui/Panel'
import { Reveal } from '@/ui/Reveal'
import { ScenarioCard } from '@/settings/ScenarioCard'
import { DEMO_SCENARIOS, EVAL_SCENARIOS, scenarioName } from '@/data/scenarios'
import { useSettings } from '@/data/settings'
import { useRunStore } from '@/data/runState'

/**
 * Simulation Settings: which scenario each page runs. Two sections, one
 * card grid each. A choice applies the next time that page's Start is
 * pressed; while a run of that kind is active the cards are inert and
 * the section says so, rather than silently queuing a change.
 */
export function SettingsPage() {
  const run = useRunStore((s) => s.state)
  const demoScenario = useSettings((s) => s.demoScenario)
  const evalScenario = useSettings((s) => s.evalScenario)
  const setDemo = useSettings((s) => s.setDemo)
  const setEval = useSettings((s) => s.setEval)

  const demoLocked = run?.running === true && run.kind === 'demo'
  const evalLocked = run?.running === true && run.kind === 'evaluation'

  return (
    <div className="flex flex-col gap-2">
      <Reveal index={0}>
        <Panel
          title="Overview · demo"
          meta={
            demoLocked
              ? 'Stop the current run to change'
              : <span>Selected: <span className="text-ink-strong">{scenarioName(demoScenario)}</span></span>
          }
          bodyClassName="px-3 pb-3"
        >
          <p className="mb-2 text-[13px] leading-[1.55] text-ink">
            What <Link to="/" className="underline decoration-[var(--rule-strong)] underline-offset-2">Overview</Link> runs
            when you press Start — one controller, Trinetra, watched live.
          </p>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {DEMO_SCENARIOS.map((s, i) => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                index={i}
                selected={s.id === demoScenario}
                disabled={demoLocked}
                onSelect={() => setDemo(s.id)}
              />
            ))}
          </div>
        </Panel>
      </Reveal>

      <Reveal index={1}>
        <Panel
          title="Performance · Trinetra vs VAC"
          meta={
            evalLocked
              ? 'Stop the current run to change'
              : <span>Selected: <span className="text-ink-strong">{scenarioName(evalScenario)}</span></span>
          }
          bodyClassName="px-3 pb-3"
        >
          <p className="mb-2 text-[13px] leading-[1.55] text-ink">
            What <Link to="/performance" className="underline decoration-[var(--rule-strong)] underline-offset-2">Performance</Link> runs:
            the same scenario twice, side by side — Trinetra on one, vehicle-actuated control on the other — scored on seven metrics.
          </p>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {EVAL_SCENARIOS.map((s, i) => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                index={i}
                selected={s.id === evalScenario}
                disabled={evalLocked}
                onSelect={() => setEval(s.id)}
              />
            ))}
          </div>
        </Panel>
      </Reveal>
    </div>
  )
}
