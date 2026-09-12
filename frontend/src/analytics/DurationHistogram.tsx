import { useMemo } from 'react'
import type { DecisionLogRow } from '@/data/api'
import { Panel } from '@/ui/Panel'
import { f1 } from '@/utils/format'

const BIN = 4 // seconds per bin

/**
 * How long the controller actually holds a phase, as a distribution
 * rather than an average — an average of 7.6 s hides whether that is
 * "always about 7 s" or "usually 2 s with occasional 35 s holds", and
 * those are very different controllers.
 */
export function DurationHistogram({ rows }: { rows: DecisionLogRow[] }) {
  const { bins, max, stats } = useMemo(() => {
    const vals = rows.map((r) => r.duration).filter((v) => Number.isFinite(v))
    if (vals.length === 0) return { bins: [] as number[], max: 0, stats: null }
    const hi = Math.max(...vals)
    const count = Math.max(1, Math.ceil((hi + 0.001) / BIN))
    const b: number[] = Array.from({ length: count }, () => 0)
    for (const v of vals) b[Math.min(count - 1, Math.floor(v / BIN))]++
    const sorted = [...vals].toSorted((x, y) => x - y)
    return {
      bins: b,
      max: Math.max(...b),
      stats: {
        n: vals.length,
        mean: vals.reduce((a, c) => a + c, 0) / vals.length,
        median: sorted[Math.floor(sorted.length / 2)],
        hi,
      },
    }
  }, [rows])

  if (!stats) {
    return (
      <Panel title="Green duration spread">
        <div className="py-6 text-center text-[13px] text-ink-mute">No decisions recorded yet.</div>
      </Panel>
    )
  }

  return (
    <Panel title="Green duration spread" meta={`${BIN}s bins`}>
      <div className="flex h-[92px] items-end gap-[3px]">
        {bins.map((n, i) => (
          <div
            key={i}
            className="flex h-full flex-1 flex-col justify-end"
            title={`${i * BIN}–${(i + 1) * BIN}s held: ${n} decision${n === 1 ? '' : 's'}`}
          >
            <div
              className="w-full rounded-t-[3px] bg-accent"
              style={{ height: `${max === 0 ? 0 : Math.max(n > 0 ? 3 : 0, (n / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-ink-mute">
        <span className="num">0s</span>
        <span className="num">{bins.length * BIN}s held</span>
      </div>
      <div className="mt-2 flex justify-between border-t border-rule-soft pt-2 text-[12px]">
        <Stat label="Median" value={`${f1(stats.median)} s`} />
        <Stat label="Mean" value={`${f1(stats.mean)} s`} />
        <Stat label="Longest" value={`${f1(stats.hi)} s`} />
        <Stat label="Decisions" value={stats.n.toLocaleString()} />
      </div>
    </Panel>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-ink-mute">{label}</span>
      <span className="num text-[14px] text-ink-strong">{value}</span>
    </span>
  )
}
