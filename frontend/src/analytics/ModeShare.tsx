import { useMemo } from 'react'
import type { DecisionSample } from './series'
import { DECISION_MODES } from '@/data/types'
import { Panel } from '@/ui/Panel'
import { motion } from 'framer-motion'
import { modeMeta } from '@/utils/signal'

/**
 * How often each of the six decision modes actually fires, as a donut.
 * Modes that never fired are listed at zero rather than hidden — "this
 * never happened" is itself a finding, and hiding it would overstate
 * how much of the engine a run exercised.
 *
 * Colours are the instrument series, not signal colours; the two alert
 * modes borrow the alert red because they genuinely are exceptions.
 */
const R = 52
const STROKE = 22
const C = 2 * Math.PI * R

/** Mapped to meaning, not to order: normal operation is green, holding is
 * amber, the two exception modes are red. */
function colourFor(mode: string): string {
  switch (mode) {
    case 'priority':
      return 'var(--series-1)' // green — normal operation
    case 'min_green_hold':
      return 'var(--series-2)' // amber — holding, cannot switch yet
    case 'gap_out':
      return 'var(--series-4)' // tan — released early
    case 'light_traffic_patience':
      return 'var(--rule-strong)' // muted green — not pre-empting
    case 'starvation_override':
      return 'var(--series-3)' // brick — forced through
    case 'emergency':
      return 'var(--alert)' // red — the true alert
    default:
      return 'var(--ink-mute)'
  }
}

export function ModeShare({ rows }: { rows: DecisionSample[] }) {
  // counts and arc geometry in one memo, before any early return, so the
  // hook order is unconditional and the running offset never escapes it.
  const { counts, total, arcs } = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of DECISION_MODES) c[m] = 0
    for (const r of rows) c[r.mode] = (c[r.mode] ?? 0) + 1
    const n = rows.length
    let offset = 0
    const a = n === 0
      ? []
      : DECISION_MODES.filter((m) => c[m] > 0).map((m) => {
          const frac = c[m] / n
          const arc = { mode: m as string, frac, dash: frac * C, offset }
          offset += frac * C
          return arc
        })
    return { counts: c, total: n, arcs: a }
  }, [rows])

  if (total === 0) {
    return (
      <Panel title="Decision modes">
        <div className="py-6 text-center text-[13px] text-ink-mute">Waiting for the first decision.</div>
      </Panel>
    )
  }

  return (
    <Panel title="Decision modes" meta={`${total.toLocaleString()} decisions`}>
      <div className="flex items-center gap-4">
        <svg width="128" height="128" viewBox="0 0 128 128" className="shrink-0" role="img" aria-label="Share of decisions by mode">
          <circle cx="64" cy="64" r={R} fill="none" stroke="var(--surface-inset)" strokeWidth={STROKE} />
          {arcs.map((a) => (
            <motion.circle
              key={a.mode}
              cx="64"
              cy="64"
              r={R}
              fill="none"
              stroke={colourFor(a.mode)}
              strokeWidth={STROKE}
              strokeDashoffset={-a.offset}
              transform="rotate(-90 64 64)"
              initial={{ strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${a.dash} ${C - a.dash}` }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <title>{`${modeMeta(a.mode).label}: ${counts[a.mode]} (${Math.round(a.frac * 100)}%)`}</title>
            </motion.circle>
          ))}
        </svg>

        <div className="min-w-0 flex-1">
          {DECISION_MODES.map((m) => {
            const n = counts[m]
            const pct = total === 0 ? 0 : (n / total) * 100
            return (
              <div key={m} className="flex items-baseline justify-between gap-2 border-b border-rule-soft py-[3px] last:border-b-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ background: n > 0 ? colourFor(m) : 'var(--surface-inset)' }}
                  />
                  <span className={n > 0 ? 'truncate text-[12.5px] text-ink-strong' : 'truncate text-[12.5px] text-ink-mute'}>
                    {modeMeta(m).label}
                  </span>
                </span>
                <span className="num shrink-0 text-[12px] text-ink-mute">
                  {n === 0 ? 'never' : `${n} · ${pct.toFixed(0)}%`}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}
