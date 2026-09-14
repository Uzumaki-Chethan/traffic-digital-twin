import clsx from 'clsx'
import { Panel } from '@/ui/Panel'
import type { ComparisonRow } from '@/data/types'
import type { EvalSample } from '@/data/evalHistory'
import { verdictFor } from '@/data/verdict'
import { f1 } from '@/utils/format'

/**
 * One evaluation metric: Trinetra and VAC over simulated time, the two
 * current values, and who is ahead. The numbers are the evaluator's own
 * running summaries (cumulative since the start of the run), so the lines
 * settle as the run goes on and the verdict reads "so far" until the
 * final frame arrives.
 */

const W = 640
const H = 96
const PAD_L = 40
const PAD_R = 6
const PAD_T = 8
const PAD_B = 16

const TRINETRA = 'var(--series-1)'
const VAC = 'var(--series-2)'

/** Metric label → unit shown after the numbers. */
const UNIT: Record<string, string> = {
  avg_waiting_time_seconds: 's',
  avg_travel_time_seconds: 's',
  max_travel_time_seconds: 's',
  avg_queue_length_vehicles: 'veh',
  max_queue_length_vehicles: 'veh',
  avg_speed_mps: 'm/s',
  throughput_vehicles: 'veh',
}

/** Plain titles; the evaluator's labels carry units in brackets. */
const TITLE: Record<string, string> = {
  avg_waiting_time_seconds: 'Average waiting time',
  avg_travel_time_seconds: 'Average travel time',
  max_travel_time_seconds: 'Worst travel time',
  avg_queue_length_vehicles: 'Average queue',
  max_queue_length_vehicles: 'Longest queue',
  avg_speed_mps: 'Average speed',
  throughput_vehicles: 'Vehicles served',
}

export function MetricBlock({
  row,
  samples,
  final,
}: {
  row: ComparisonRow
  samples: readonly EvalSample[]
  final: boolean
}) {
  const verdict = verdictFor(row.improvement)
  const unit = UNIT[row.key] ?? ''
  const title = TITLE[row.key] ?? row.label
  const tied = row.key === 'throughput_vehicles'

  const t0 = samples.length ? samples[0].t : 0
  const t1 = samples.length ? samples[samples.length - 1].t : 1
  const tSpan = Math.max(1e-6, t1 - t0)
  const aiVals = samples.map((s) => s.ai[row.key] ?? 0)
  const vacVals = samples.map((s) => s.vac[row.key] ?? 0)
  const max = Math.max(...aiVals, ...vacVals, 0)
  const scaleY = (v: number) => (max === 0 ? H - PAD_B : H - PAD_B - (v / max) * (H - PAD_T - PAD_B))
  const scaleX = (t: number) => PAD_L + ((t - t0) / tSpan) * (W - PAD_L - PAD_R)
  const path = (vals: number[]) =>
    samples.map((s, i) => `${scaleX(s.t).toFixed(1)},${scaleY(vals[i]).toFixed(1)}`).join(' ')

  const badgeTone = {
    trinetra: 'bg-[var(--accent-soft)] text-[var(--accent-ink)] border-[var(--accent)]',
    vac: 'bg-[#f0b8b8] text-[var(--signal-red)] border-[var(--signal-red)]',
    even: 'bg-plate text-ink border-rule',
  }[verdict.side]

  return (
    <Panel
      title={title}
      meta={
        <span
          className={clsx('rounded-full border px-2 py-0.5 text-[11.5px] font-medium', badgeTone)}
          aria-label={`${title}: ${verdict.label}, ${final ? 'final' : 'so far'}`}
        >
          {verdict.label} · {final ? 'final' : 'so far'}
        </span>
      }
      bodyClassName="px-3 pb-2.5"
    >
      <div className="mb-1 flex items-baseline gap-4 text-[12.5px]">
        <span className="flex items-center gap-1.5 text-ink">
          <span className="h-[3px] w-4 rounded-full" style={{ background: TRINETRA }} />
          Trinetra <span className="num text-ink-strong">{f1(row.ai)}</span> {unit}
        </span>
        <span className="flex items-center gap-1.5 text-ink">
          <span className="h-[3px] w-4 rounded-full" style={{ background: VAC }} />
          VAC <span className="num text-ink-strong">{f1(row.baseline)}</span> {unit}
        </span>
      </div>
      {samples.length >= 2 ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title} over simulated time, Trinetra against VAC`}
        >
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="var(--rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <text x={PAD_L - 4} y={PAD_T + 8} textAnchor="end" fontSize="11" fontFamily="var(--font-num)" fill="var(--ink-mute)">
            {max.toFixed(max < 10 ? 1 : 0)}
          </text>
          <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" fontSize="11" fontFamily="var(--font-num)" fill="var(--ink-mute)">
            0
          </text>
          <polyline points={path(vacVals)} fill="none" stroke={VAC} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <polyline points={path(aiVals)} fill="none" stroke={TRINETRA} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      ) : (
        <div className="py-4 text-center text-[12.5px] text-ink-mute">Waiting for a second tick.</div>
      )}
      <div className="mt-1 flex justify-between text-[11.5px] text-ink-mute">
        <span className="num">{Math.round(t0)}s</span>
        <span>{tied ? 'tied by construction — both controllers serve the same vehicles' : 'simulated time · running totals'}</span>
        <span className="num">{Math.round(t1)}s</span>
      </div>
    </Panel>
  )
}
