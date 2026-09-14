import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import { useSim } from '@/data/store'
import { useRunStore } from '@/data/runState'
import { isEvaluation, type EvaluationSnapshot } from '@/data/types'
import { getEvalSamples, useEvalHistory } from '@/data/evalHistory'
import { useSettings } from '@/data/settings'
import { scenarioName } from '@/data/scenarios'
import { verdictFor } from '@/data/verdict'
import { Reveal } from '@/ui/Reveal'
import { ControllerWindow } from '@/performance/ControllerWindow'
import { HOME_VIEW, type View } from '@/overview/usePanZoom'
import { MetricBlock } from '@/performance/MetricBlock'
import { EvalStartPrompt } from '@/performance/EvalStartPrompt'

/**
 * Trinetra against vehicle-actuated control on the identical scenario,
 * live: two junctions side by side, then one block per evaluation
 * metric with a running verdict. Everything comes from the evaluation
 * frames on the WebSocket (data/evalHistory.ts remembers them); nothing
 * is read from the database, and the model is shown nowhere.
 */
export function PerformancePage() {
  const latest = useSim((s) => s.latest)
  // One pan/zoom for both windows: a comparison only means something
  // when the two junctions are framed identically.
  const sharedView = useState<View>(HOME_VIEW)
  const link = useSim((s) => s.link)
  const run = useRunStore((s) => s.state)
  const evalScenario = useSettings((s) => s.evalScenario)
  // Subscribing to `revision` is what re-renders this page as samples
  // arrive (at most once a second); the samples themselves live outside
  // the store so a 3 600-entry array is never copied per tick.
  useEvalHistory((s) => s.revision)
  const final = useEvalHistory((s) => s.final)
  const rows = useEvalHistory((s) => s.rows)
  const historyScenario = useEvalHistory((s) => s.scenario)

  const frame: EvaluationSnapshot | null = isEvaluation(latest) ? latest : null
  const samples = getEvalSamples()

  // A finished evaluation keeps its verdicts on screen; the junctions
  // go unpowered because that traffic no longer exists (Overview's rule).
  const ended = run?.available === true && !run.running
  const haveResults = rows.length > 0
  const powered = frame !== null && !ended
  const dimmed = link !== 'open' && powered

  const chipScenario = run?.running && run.kind === 'evaluation' && run.scenario
    ? run.scenario
    : historyScenario ?? evalScenario

  const wins = rows.filter((r) => verdictFor(r.improvement).side !== 'vac').length

  if (!frame && !haveResults) {
    return (
      <div className="flex flex-col gap-2">
        <Header scenario={chipScenario} />
        <EvalStartPrompt run={run} />
      </div>
    )
  }

  return (
    <div className={dimmed ? 'flex flex-col gap-2 opacity-70 transition-opacity' : 'flex flex-col gap-2 transition-opacity'}>
      <Header scenario={chipScenario} />

      <div className="grid grid-cols-2 gap-2">
        <Reveal index={0}>
          <ControllerWindow title="Trinetra" side={frame?.ai ?? null} powered={powered} sharedView={sharedView} />
        </Reveal>
        <Reveal index={1}>
          <ControllerWindow title="Vehicle-actuated control" side={frame?.baseline ?? null} powered={powered} sharedView={sharedView} />
        </Reveal>
      </div>

      {haveResults && (
        <div className="flex items-center justify-between rounded-panel border border-rule bg-plate px-3 py-2 text-[13px] text-ink">
          <span>
            <span className="display text-[13px] text-ink-strong">{final ? 'Final' : 'So far'}</span>
            <span className="text-ink-mute"> · </span>
            Trinetra ahead or even on <span className="num text-ink-strong">{wins}</span> of{' '}
            <span className="num text-ink-strong">{rows.length}</span> metrics
            {final ? '' : ' — running totals, they settle as the run goes on'}
          </span>
          <span className="num text-[12px] text-ink-mute">
            {samples.length.toLocaleString()} ticks
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
        {rows.map((row, i) => (
          <Reveal key={row.key} index={2 + i}>
            <MetricBlock row={row} samples={samples} final={final} />
          </Reveal>
        ))}
      </div>
    </div>
  )
}

function Header({ scenario }: { scenario: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/settings"
        className="flex items-center gap-1.5 rounded-control border border-rule bg-plate px-2.5 py-1 text-[12px] text-ink"
        title="Change the scenario on the Simulation Settings page"
      >
        <SlidersHorizontal size={12} aria-hidden />
        Scenario: <span className="text-ink-strong">{scenarioName(scenario)}</span>
      </Link>
      <span className="text-[12px] text-ink-mute">Trinetra vs vehicle-actuated control · same scenario, same vehicles, in lockstep</span>
    </div>
  )
}
