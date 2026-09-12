import type { ReactNode } from 'react'
import { api } from '@/data/api'
import { useAsync } from '@/data/useAnalytics'
import { useSim } from '@/data/store'
import { isLive } from '@/data/types'
import { Panel } from '@/ui/Panel'
import { f1 } from '@/utils/format'
import { LanePressureHeatmap } from '@/analytics/LanePressureHeatmap'
import { LaneLedger } from '@/analytics/LaneLedger'
import { CongestionTrend } from '@/analytics/CongestionTrend'
import { PeakPeriods } from '@/analytics/PeakPeriods'
import { ModeShare } from '@/analytics/ModeShare'
import { PhaseShare } from '@/analytics/PhaseShare'
import { NetworkTrendLines } from '@/analytics/NetworkTrendLines'
import { DurationHistogram } from '@/analytics/DurationHistogram'
import { SpeedWaitScatter } from '@/analytics/SpeedWaitScatter'
import { RecordedDataset } from '@/analytics/RecordedDataset'

/**
 * The junction in detail: where pressure falls, how the controller
 * behaves, and how the network responded — read from the recorded
 * database, so the page works with no simulation running. Live columns
 * fill in when one is.
 *
 * Deliberately a different shape from the Overview, and deliberately a
 * different chart per question: a heatmap for lane × time, lines for
 * change over time, a donut and a stacked bar for shares, a histogram
 * for spread, and a scatter for a relationship.
 */
export function AnalyticsPage() {
  const latest = useSim((s) => s.latest)
  const lastLive = useSim((s) => s.lastLive)
  const live = isLive(latest) ? latest : lastLive
  const powered = live !== null

  const laneBuckets = useAsync((s) => api.congestionByLane(60, s))
  const netBuckets = useAsync((s) => api.congestionTrend(60, s))
  const laneWaits = useAsync((s) => api.laneWaitTimes(s))
  const netWait = useAsync((s) => api.networkWaitTime(s))
  const peaks = useAsync((s) => api.peakPeriods(5, s))
  const decisions = useAsync((s) => api.decisionLogs(1000, s))
  const perf = useAsync((s) => api.performanceLogs(1000, s))

  const loading = laneBuckets.loading || laneWaits.loading || decisions.loading || perf.loading
  const failed = laneBuckets.error ?? laneWaits.error ?? decisions.error ?? perf.error

  if (loading) return <Notice title="Analytics">Loading recorded history&hellip;</Notice>
  if (failed) {
    return (
      <Notice title="Analytics unavailable">
        <p>
          The recorded data is safe in the database — but the server that reads it out runs{' '}
          <em>inside</em> the simulation process, so closing SUMO shut it down too. There is no separate
          dashboard process to keep serving it.
        </p>
        <p className="mt-2">
          Start <span className="num">python app.py</span> from <span className="num">backend/</span> again and this
          page will fill in immediately — you don&rsquo;t need to press play, because none of it comes from the live
          stream.
        </p>
        <p className="mt-2 text-[12px] text-ink-mute">
          <span className="num">{failed}</span>
        </p>
      </Notice>
    )
  }

  const hasHistory = (laneBuckets.data?.length ?? 0) > 0 || (decisions.data?.length ?? 0) > 0
  const laneSampleTotal = laneWaits.data
    ? Object.values(laneWaits.data.lanes).reduce((a, l) => a + l.sample_count, 0)
    : null

  if (!hasHistory) {
    return (
      <Notice title="No recorded history">
        The database has no history yet. Run the simulation once (<span className="num">python app.py</span> from{' '}
        <span className="num">backend/</span>) and this page fills in — it reads recorded data, so it keeps working
        afterwards even with the simulation paused or finished, for as long as that process is up.
      </Notice>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <LanePressureHeatmap buckets={laneBuckets.data ?? []} />

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-7">
          <LaneLedger lanes={live?.lanes ?? []} waits={laneWaits.data} powered={powered} />
        </div>
        <div className="col-span-5 flex flex-col gap-2">
          <NetworkTrendLines rows={perf.data ?? []} />
          <CongestionTrend buckets={netBuckets.data ?? []} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-5">
          <ModeShare rows={decisions.data ?? []} />
        </div>
        <div className="col-span-4">
          <DurationHistogram rows={decisions.data ?? []} />
        </div>
        <div className="col-span-3">
          <SpeedWaitScatter rows={perf.data ?? []} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-4">
          <PhaseShare rows={decisions.data ?? []} />
        </div>
        <div className="col-span-4">
          <PeakPeriods peaks={peaks.data ?? []} />
        </div>
        <div className="col-span-4 flex flex-col gap-2">
          <Panel title="Recorded totals">
            <div className="flex items-baseline justify-between py-1">
              <span className="text-[13px] text-ink">Mean wait, whole network</span>
              <span className="num text-[20px] text-ink-strong">
                {netWait.data?.average_wait_seconds == null ? '—' : `${f1(netWait.data.average_wait_seconds)} s`}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t border-rule-soft pt-2 text-[12.5px]">
              <span className="text-ink-mute">Samples behind that figure</span>
              <span className="num text-ink-strong">{netWait.data?.sample_count.toLocaleString() ?? '—'}</span>
            </div>
          </Panel>
        </div>
      </div>

      <RecordedDataset
        networkSamples={netWait.data?.sample_count ?? null}
        laneSamples={laneSampleTotal}
        decisions={decisions.data?.length ?? null}
      />
    </div>
  )
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md">
        <Panel title={title}>
          <div className="text-[13px] leading-[1.5] text-ink">{children}</div>
        </Panel>
      </div>
    </div>
  )
}
