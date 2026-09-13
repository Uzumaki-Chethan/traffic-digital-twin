import { useMemo } from 'react'
import { useSim } from '@/data/store'
import { isLive } from '@/data/types'
import { getSamples, useLiveHistory } from '@/data/liveHistory'
import { useRunStore } from '@/data/runState'
import {
  chooseBucket,
  congestionBuckets,
  decisionSamples,
  laneBuckets,
  laneWaitMeans,
  networkSamples,
  networkWaitMean,
  peakWindows,
} from '@/analytics/series'
import { Panel } from '@/ui/Panel'
import { Reveal } from '@/ui/Reveal'
import { StartPrompt } from '@/analytics/StartPrompt'
import { clock, f1 } from '@/utils/format'
import { LanePressureHeatmap } from '@/analytics/LanePressureHeatmap'
import { LaneLedger } from '@/analytics/LaneLedger'
import { CongestionTrend } from '@/analytics/CongestionTrend'
import { PeakPeriods } from '@/analytics/PeakPeriods'
import { ModeShare } from '@/analytics/ModeShare'
import { PhaseShare } from '@/analytics/PhaseShare'
import { NetworkTrendLines } from '@/analytics/NetworkTrendLines'
import { DurationHistogram } from '@/analytics/DurationHistogram'
import { SpeedWaitScatter } from '@/analytics/SpeedWaitScatter'
import { LiveDataSource } from '@/analytics/LiveDataSource'

/**
 * The junction in detail, for the run happening right now: where
 * pressure falls, how the controller behaves, and how the network is
 * responding.
 *
 * Every panel here reads the live stream (see data/liveHistory.ts), not
 * the database. That was a deliberate change on 2026-09-12: reading
 * SQLite meant averaging every run ever recorded into one line — and
 * since simulated time restarts at zero each run, "t = 120 s" was a
 * different moment in each of them — and it meant the whole page went
 * 502 the moment SUMO closed, because the server lived inside the
 * simulation. Now there is nothing to fetch: if a simulation is running,
 * this fills in; if not, it says so and offers to start one.
 *
 * Deliberately a different shape from the Overview, and deliberately a
 * different chart per question: a heatmap for lane x time, lines for
 * change over time, a donut and a stacked bar for shares, a histogram
 * for spread, and a scatter for a relationship.
 */
export function AnalyticsPage() {
  const latest = useSim((s) => s.latest)
  const lastLive = useSim((s) => s.lastLive)
  const revision = useLiveHistory((s) => s.revision)
  const count = useLiveHistory((s) => s.count)
  const run = useRunStore((s) => s.state)

  const live = isLive(latest) ? latest : lastLive

  // One derivation pass per refresh, shared by every panel below.
  // `revision` is the dependency on purpose: the buffer is mutable and
  // bumps that counter at most once a second, which is what keeps ten
  // charts from re-deriving dozens of times a second on a fast run.
  const derived = useMemo(() => {
    const samples = getSamples()
    const span = samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 0
    const width = chooseBucket(span)
    return {
      span,
      width,
      lanes: laneBuckets(samples, width),
      network: congestionBuckets(samples, width),
      perf: networkSamples(samples),
      decisions: decisionSamples(samples),
      waits: laneWaitMeans(samples),
      meanWait: networkWaitMean(samples),
      peaks: peakWindows(samples, width, 5),
      from: samples.length > 0 ? samples[0].t : 0,
      to: samples.length > 0 ? samples[samples.length - 1].t : 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  if (count === 0) return <StartPrompt run={run} />

  // A run that has ended leaves its history on screen rather than
  // blanking it — but it must not pretend to still be live.
  const flowing = run?.running === true && run.paused !== true

  return (
    <div className="flex flex-col gap-2">
      <Reveal index={0}>
        <div className="flex items-center justify-between rounded-panel border border-rule bg-plate px-3 py-2">
          <div className="text-[13px] text-ink">
            <span className="display text-[13px] text-ink-strong">This run</span>
            <span className="text-ink-mute"> · </span>
            {derived.span < 1 ? 'first tick just arrived' : `${clock(derived.to)} of simulated time`}
            <span className="text-ink-mute"> · </span>
            <span className="num">{count.toLocaleString()}</span> ticks recorded
            <span className="text-ink-mute"> · </span>
            <span className="num">{derived.width}s</span> buckets
          </div>
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            <span
              className={
                flowing
                  ? 'h-2.5 w-2.5 rounded-full bg-lamp-green'
                  : 'h-2.5 w-2.5 rounded-full bg-lamp-amber'
              }
            />
            <span className={flowing ? 'text-ink-strong' : 'text-ink'}>
              {flowing ? 'Live — updating' : run?.paused ? 'Paused — frozen at the last tick' : 'Run ended — last state held'}
            </span>
          </span>
        </div>
      </Reveal>

      <Reveal index={1}>
        <LanePressureHeatmap buckets={derived.lanes} width={derived.width} />
      </Reveal>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-7">
          <Reveal index={2}>
            <LaneLedger lanes={live?.lanes ?? []} waits={derived.waits} powered={live !== null} />
          </Reveal>
        </div>
        <div className="col-span-5 flex flex-col gap-2">
          <Reveal index={3}>
            <NetworkTrendLines rows={derived.perf} />
          </Reveal>
          <Reveal index={4}>
            <CongestionTrend buckets={derived.network} />
          </Reveal>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-5">
          <Reveal index={5}>
            <ModeShare rows={derived.decisions} />
          </Reveal>
        </div>
        <div className="col-span-4">
          <Reveal index={6}>
            <DurationHistogram rows={derived.decisions} />
          </Reveal>
        </div>
        <div className="col-span-3">
          <Reveal index={7}>
            <SpeedWaitScatter rows={derived.perf} />
          </Reveal>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-4">
          <Reveal index={8}>
            <PhaseShare rows={derived.decisions} />
          </Reveal>
        </div>
        <div className="col-span-4">
          <Reveal index={9}>
            <PeakPeriods peaks={derived.peaks} />
          </Reveal>
        </div>
        <div className="col-span-4 flex flex-col gap-2">
          <Panel title="This run so far">
            <div className="flex items-baseline justify-between py-1">
              <span className="text-[13px] text-ink">Mean wait, whole network</span>
              <span className="num text-[20px] text-ink-strong">
                {derived.meanWait == null ? '—' : `${f1(derived.meanWait)} s`}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t border-rule-soft pt-2 text-[12.5px]">
              <span className="text-ink-mute">Ticks behind that figure</span>
              <span className="num text-ink-strong">{count.toLocaleString()}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-rule-soft pt-2 text-[12.5px]">
              <span className="text-ink-mute">Vehicles on the network now</span>
              <span className="num text-ink-strong">{live ? live.metrics.vehicles : '—'}</span>
            </div>
          </Panel>
        </div>
      </div>

      <LiveDataSource ticks={count} from={derived.from} to={derived.to} />
    </div>
  )
}
