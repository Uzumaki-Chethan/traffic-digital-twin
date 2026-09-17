import { motion, useReducedMotion } from 'framer-motion'
import clsx from 'clsx'
import { Panel } from '@/ui/Panel'
import type { DecisionView } from '@/data/types'
import { PHASE_NAMES } from '@/data/types'
import { phaseLabel, modeMeta } from '@/utils/signal'
import { value } from '@/ui/motion'

/**
 * Why this phase: the four phase scores as bars, the served phase
 * marked, and the decision boundary drawn as a line — the served score
 * plus the hysteresis margin, which is what a challenger has to clear
 * before an ordinary preference switch is even considered. The served
 * phase is often NOT the highest bar, and this is the panel that shows
 * why that is a decision rather than a fault. Scores and margin are the
 * engine's own numbers for this tick (`decision.phase_scores`,
 * `decision.margin`); nothing here is derived on the frontend.
 */
export function ScoreLedger({ decision, powered }: { decision: DecisionView; powered: boolean }) {
  const reduced = useReducedMotion()
  const scores = decision.phase_scores
  const served = decision.active_phase
  const servedScore = scores[served] ?? 0
  const margin = decision.margin ?? 0
  const boundary = servedScore + margin
  // One scale for all four bars and the line: the largest thing drawn.
  const scale = Math.max(1, boundary, ...PHASE_NAMES.map((p) => scores[p] ?? 0)) * 1.05
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`
  const mode = modeMeta(decision.mode)

  return (
    <Panel
      title="Why this phase"
      meta={
        powered ? (
          <span title="A challenger must lead the served phase's score by this much">
            margin <span className="text-ink-strong">+{margin.toFixed(2)}</span>
          </span>
        ) : undefined
      }
      className="w-full"
      bodyClassName="px-3.5 pb-3 pt-1"
    >
      {!powered ? (
        <div className="py-3 text-center text-[12.5px] text-ink-mute">No simulation running.</div>
      ) : (
        <div>
          <div className="relative flex flex-col gap-1.5">
            {PHASE_NAMES.map((p) => {
              const s = scores[p] ?? 0
              const isServed = p === served
              return (
                <div key={p} className="grid grid-cols-[132px_1fr_40px] items-center gap-2 text-[12px]">
                  <span className={clsx('truncate', isServed ? 'font-semibold text-ink-strong' : 'text-ink')}>
                    {phaseLabel(p)}
                  </span>
                  <div className="relative h-[9px] overflow-hidden rounded-full bg-inset">
                    <motion.div
                      className={clsx('h-full rounded-full', isServed ? 'bg-[var(--signal-green)]' : 'bg-[var(--series-4)]')}
                      initial={false}
                      animate={{ width: pct(s) }}
                      transition={reduced ? { duration: 0 } : value}
                    />
                  </div>
                  <span className={clsx('num text-right', isServed ? 'font-semibold text-ink-strong' : 'text-ink')}>
                    {s.toFixed(2)}
                  </span>
                </div>
              )
            })}
            {/* The decision boundary, across the bar column only, the
                height of the four bars. */}
            {margin > 0 && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute top-[-2px] bottom-[-2px] w-0 border-l-2 border-dashed border-[var(--signal-red)]"
                initial={false}
                animate={{ left: `calc(132px + 0.5rem + (100% - 132px - 40px - 1rem) * ${boundary / scale})` }}
                transition={reduced ? { duration: 0 } : value}
              />
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-ink-mute">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-3 border-t-2 border-dashed border-[var(--signal-red)]" />
              boundary {boundary.toFixed(2)} — a challenger past this line takes the junction
            </span>
            <span className={clsx('shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5', mode.loud ? 'border-[var(--signal-red)] text-[var(--signal-red)]' : 'border-rule text-ink')}>
              {mode.label}
            </span>
          </div>
        </div>
      )}
    </Panel>
  )
}
