import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import clsx from 'clsx'
import { Panel } from '@/ui/Panel'
import type { ComparisonRow } from '@/data/types'
import type { EvalSample } from '@/data/evalHistory'
import { verdictFor } from '@/data/verdict'
import { Num } from '@/ui/Num'
import { DUR, EASE_OUT } from '@/ui/motion'

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
  const reduced = useReducedMotion()
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
        /* Keyed on WHO is ahead, not on the number. Keying it on the text
           re-ran the crossfade every tick as the percentage moved a
           decimal, and with mode="wait" the badge spent most of its life
           mid-exit — it read as missing. The figure inside updates in
           place; only a change of leader is worth animating. */
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={verdict.side}
            initial={reduced ? false : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -3 }}
            transition={{ duration: DUR.fast, ease: EASE_OUT }}
            className={clsx(
              'inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium',
              badgeTone,
            )}
            aria-label={`${title}: ${verdict.label}, ${final ? 'final' : 'so far'}`}
          >
            {verdict.short}
          </motion.span>
        </AnimatePresence>
      }
      bodyClassName="px-3 pb-2.5"
    >
      {/* The two readings. Each tweens to its new value over --dur-value
          instead of snapping, and the one ahead carries the weight — a
          comparison should be legible without reading the badge. */}
      <div className="mb-1 flex items-baseline gap-4 text-[12.5px]">
        <span className={clsx('flex items-center gap-1.5', verdict.side === 'trinetra' ? 'text-ink-strong' : 'text-ink')}>
          <span
            className="h-[3px] rounded-full transition-[width] duration-200"
            style={{ background: TRINETRA, width: verdict.side === 'trinetra' ? 22 : 16 }}
          />
          Trinetra{' '}
          <Num
            value={row.ai}
            digits={1}
            className={clsx('num', verdict.side === 'trinetra' ? 'font-semibold text-ink-strong' : 'text-ink-strong')}
          />{' '}
          {unit}
        </span>
        <span className={clsx('flex items-center gap-1.5', verdict.side === 'vac' ? 'text-ink-strong' : 'text-ink')}>
          <span
            className="h-[3px] rounded-full transition-[width] duration-200"
            style={{ background: VAC, width: verdict.side === 'vac' ? 22 : 16 }}
          />
          VAC <Num value={row.baseline} digits={1} className="num text-ink-strong" /> {unit}
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
      {/* Whether these are running totals or the settled result belongs
          here rather than in the badge, which has to stay short enough to
          sit beside the title on one line. */}
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[11.5px] text-ink-mute">
        <span className="num shrink-0">{Math.round(t0)}s</span>
        <span className="min-w-0 text-center">
          {tied
            ? final
              ? 'equal by construction — both served the same vehicles'
              : 'trips completed so far — equal once both finish'
            : final
              ? 'simulated time · final'
              : 'simulated time · running totals'}
        </span>
        <span className="num shrink-0">{Math.round(t1)}s</span>
      </div>
    </Panel>
  )
}
