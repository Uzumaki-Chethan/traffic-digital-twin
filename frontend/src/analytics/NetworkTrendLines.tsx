import { useMemo } from 'react'
import type { PerformanceLogRow } from '@/data/api'
import { Panel } from '@/ui/Panel'
import { f1 } from '@/utils/format'

/**
 * Network waiting time and queue length over simulated time, as two line
 * plots stacked on ONE shared x axis with separate y axes — never a dual
 * y-axis on one plot, which would invite a false visual correlation
 * between two different units.
 *
 * Hand-rolled SVG: one polyline per series, hairline axis, ticks outside,
 * no gridlines, no dots.
 */
const W = 640
const H = 78
const PAD_L = 38
const PAD_R = 6
const PAD_T = 8
const PAD_B = 16

interface Series {
  label: string
  unit: string
  key: 'avg_wait' | 'queue_length'
  colour: string
}
const SERIES: Series[] = [
  { label: 'Waiting time', unit: 's', key: 'avg_wait', colour: 'var(--series-2)' },
  { label: 'Queue length', unit: 'veh', key: 'queue_length', colour: 'var(--series-1)' },
]

export function NetworkTrendLines({ rows }: { rows: PerformanceLogRow[] }) {
  // The endpoint returns newest-first; a time plot needs oldest-first.
  const data = useMemo(() => [...rows].toSorted((a, b) => a.time - b.time), [rows])

  if (data.length < 2) {
    return (
      <Panel title="Network over time">
        <div className="py-6 text-center text-[13px] text-ink-mute">Not enough recorded samples yet.</div>
      </Panel>
    )
  }

  const t0 = data[0].time
  const t1 = data[data.length - 1].time
  const tSpan = Math.max(1e-6, t1 - t0)

  return (
    <Panel title="Network over time" meta={`${data.length.toLocaleString()} samples · ${Math.round(tSpan)}s`}>
      {SERIES.map((s) => {
        const vals = data.map((r) => r[s.key])
        const max = Math.max(...vals, 0)
        const scaleY = (v: number) => (max === 0 ? H - PAD_B : H - PAD_B - (v / max) * (H - PAD_T - PAD_B))
        const scaleX = (t: number) => PAD_L + ((t - t0) / tSpan) * (W - PAD_L - PAD_R)
        const d = data.map((r) => `${scaleX(r.time).toFixed(1)},${scaleY(r[s.key]).toFixed(1)}`).join(' ')
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length
        return (
          <div key={s.key} className="mb-1.5 last:mb-0">
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink">
                <span className="h-[3px] w-4 rounded-full" style={{ background: s.colour }} />
                {s.label}
              </span>
              <span className="num text-[12px] text-ink-mute">
                peak <span className="text-ink-strong">{f1(max)}</span> {s.unit} · mean{' '}
                <span className="text-ink-strong">{f1(mean)}</span> {s.unit}
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-0.5 w-full" preserveAspectRatio="none" role="img" aria-label={`${s.label} over simulated time`}>
              {/* y axis with max/0 ticks outside the plot */}
              <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="var(--rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <text x={PAD_L - 4} y={PAD_T + 8} textAnchor="end" fontSize="11" fontFamily="var(--font-num)" fill="var(--ink-mute)">
                {max.toFixed(max < 10 ? 1 : 0)}
              </text>
              <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" fontSize="11" fontFamily="var(--font-num)" fill="var(--ink-mute)">
                0
              </text>
              <polyline points={d} fill="none" stroke={s.colour} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
          </div>
        )
      })}
      <div className="mt-1 flex justify-between border-t border-rule-soft pt-1.5 text-[12px] text-ink-mute">
        <span className="num">{Math.round(t0)}s</span>
        <span>simulated time</span>
        <span className="num">{Math.round(t1)}s</span>
      </div>
    </Panel>
  )
}
