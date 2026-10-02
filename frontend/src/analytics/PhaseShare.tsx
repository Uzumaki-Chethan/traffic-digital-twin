import { useMemo } from 'react'
import type { DecisionSample } from './series'
import { PHASE_NAMES } from '@/data/types'
import { Panel } from '@/ui/Panel'
import { motion } from 'framer-motion'
import { phaseLabel } from '@/utils/signal'

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)']

/**
 * Which phase the controller spent its decisions on, as one stacked bar
 * — a share-of-whole read that a donut would make harder to compare
 * across four near-equal parts.
 */
export function PhaseShare({ rows }: { rows: DecisionSample[] }) {
  const { counts, total } = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of PHASE_NAMES) c[p] = 0
    for (const r of rows) c[r.phase] = (c[r.phase] ?? 0) + 1
    return { counts: c, total: rows.length }
  }, [rows])

  if (total === 0) {
    return (
      <Panel title="Phase share">
        <div className="py-6 text-center text-[13px] text-ink-mute">Waiting for the first decision.</div>
      </Panel>
    )
  }

  return (
    <Panel title="Phase share" meta={`${total.toLocaleString()} decisions`}>
      <div className="flex h-7 w-full overflow-hidden rounded-control">
        {PHASE_NAMES.map((p, i) => {
          const pct = (counts[p] / total) * 100
          if (pct === 0) return null
          return (
            <motion.div
              key={p}
              className="flex items-center justify-center overflow-hidden"
              style={{ background: SERIES[i] }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              title={`${phaseLabel(p)}: ${counts[p]} (${pct.toFixed(1)}%)`}
            >
              {pct > 12 && <span className="num text-[12px] text-ink-strong">{pct.toFixed(0)}%</span>}
            </motion.div>
          )
        })}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3">
        {PHASE_NAMES.map((p, i) => (
          <div key={p} className="flex items-baseline justify-between gap-2 border-b border-rule-soft py-[3px]">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: SERIES[i] }} />
              <span className="truncate text-[12.5px] text-ink">{phaseLabel(p)}</span>
            </span>
            <span className="num shrink-0 text-[12px] text-ink-mute">{counts[p]}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}
