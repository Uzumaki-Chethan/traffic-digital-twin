import { useState } from 'react'
import { useSim } from '@/data/store'
import { useRunStore } from '@/data/runState'
import { isEvaluation, type EvaluationSnapshot } from '@/data/types'
import { getEvalSamples, useEvalHistory } from '@/data/evalHistory'
import { verdictFor } from '@/data/verdict'
import { Reveal } from '@/ui/Reveal'
import { ControllerWindow } from '@/performance/ControllerWindow'
import { HOME_VIEW, type View } from '@/overview/usePanZoom'
import { EmptyMetricBlock, METRIC_KEYS, MetricBlock } from '@/performance/MetricBlock'
import { DispatchBar } from '@/layout/DispatchBar'

/**
 * Trinetra against vehicle-actuated control on the identical scenario,
 * live: two junctions side by side, then one block per evaluation
 * metric with a running verdict. Everything comes from the evaluation
 * frames on the WebSocket (data/evalHistory.ts remembers them); nothing
 * is read from the database, and the model is shown nowhere.
 *
 * The page keeps its shape whether or not anything is running: before
 * an evaluation the two junctions sit dark and the seven blocks are
 * empty, exactly where they fill in — Overview's rule for its own plate.
 * Start is in the top bar, which on this page starts the evaluation.
 */
export function PerformancePage() {
  const latest = useSim((s) => s.latest)
  // Each window has its own pan/zoom, so one junction can be studied up
  // close while the other keeps its frame. Each window's "Match" button
  // copies the other's framing across for a like-for-like look.
  const aiView = useState<View>(HOME_VIEW)
  const vacView = useState<View>(HOME_VIEW)
  const link = useSim((s) => s.link)
  const run = useRunStore((s) => s.state)
  const failure = useRunStore((s) => s.failure)
  // Subscribing to `revision` is what re-renders this page as samples
  // arrive (at most once a second); the samples themselves live outside
  // the store so a 3 600-entry array is never copied per tick.
  useEvalHistory((s) => s.revision)
  const final = useEvalHistory((s) => s.final)
  const rows = useEvalHistory((s) => s.rows)

  const frame: EvaluationSnapshot | null = isEvaluation(latest) ? latest : null
  const samples = getEvalSamples()

  // A finished evaluation keeps its verdicts on screen; the junctions
  // go unpowered because that traffic no longer exists (Overview's rule).
  // A demo run is another kind: the last evaluation frame still on the
  // wire must not read as live while one is up.
  const ended = run?.available === true && (!run.running || run.kind !== 'evaluation')
  const haveResults = rows.length > 0
  const powered = frame !== null && !ended
  const dimmed = link !== 'open' && powered

  const demoActive = run?.running === true && run.kind === 'demo'
  const starting = run?.running === true && run.kind === 'evaluation' && frame === null
  const note = starting
    ? 'starting — both junctions appear on the first tick'
    : demoActive
      ? 'a demo run is up on Overview — Start here ends it'
      : !powered
        ? 'press Start to run the evaluation'
        : undefined

  const wins = rows.filter((r) => verdictFor(r.improvement).side !== 'vac').length

  return (
    <div className={dimmed ? 'flex flex-col gap-2 opacity-70 transition-opacity' : 'flex flex-col gap-2 transition-opacity'}>
      <DispatchBar />
      <div className="grid grid-cols-2 gap-2">
        <Reveal index={0}>
          <ControllerWindow
            title="Trinetra"
            side={frame?.ai ?? null}
            powered={powered}
            view={aiView}
            matchView={{ label: 'the VAC window', view: vacView[0] }}
            simTime={frame?.sim_time}
            note={note}
            motionSide="ai"
          />
        </Reveal>
        <Reveal index={1}>
          <ControllerWindow
            title="Vehicle-actuated control"
            side={frame?.baseline ?? null}
            powered={powered}
            view={vacView}
            matchView={{ label: 'the Trinetra window', view: aiView[0] }}
            simTime={frame?.sim_time}
            note={note}
            motionSide="baseline"
          />
        </Reveal>
      </div>

      {(failure || run?.error) && !powered && (
        <div className="rounded-control border border-alert bg-alert-wash px-3 py-1.5 text-[12.5px] text-alert">
          {failure ?? `Last run ended with: ${run?.error}`}
        </div>
      )}

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
        {haveResults
          ? rows.map((row, i) => (
              <Reveal key={row.key} index={2 + i}>
                <MetricBlock row={row} samples={samples} final={final} />
              </Reveal>
            ))
          : METRIC_KEYS.map((key, i) => (
              <Reveal key={key} index={2 + i}>
                <EmptyMetricBlock metricKey={key} />
              </Reveal>
            ))}
      </div>
    </div>
  )
}
