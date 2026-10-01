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
    <Panel explain="why-phase"
      title="Why this phase"
      meta={
        powered ? (
          <span title="A challenger must lead the served phase's score by this much">
            margin <span className="text-ink-strong">+{margin.toFixed(2)}</span>
          </span>
        ) : undefined
      }
      className="w-full"
      bodyClassName="px-[18px] pb-4 pt-1"
    >
      {!powered ? (
        <div className="py-3 text-center text-[12.5px] text-ink-mute">No simulation running.</div>
      ) : (
        <div>
          <div className="relative flex flex-col gap-1.5 pt-3">
            {PHASE_NAMES.map((p) => {
              const s = scores[p] ?? 0
              const isServed = p === served
              return (
                <div
                  key={p}
                  className="-mx-2 grid grid-cols-[132px_1fr_40px] items-center gap-2 rounded-lg px-2 py-1 text-[12.5px] transition-[background] duration-300"
                  style={
                    isServed
                      ? {
                          background: 'linear-gradient(90deg, rgb(255 196 40 / 0.5), rgb(255 214 70 / 0.2) 60%, rgb(255 214 70 / 0))',
                          boxShadow: '0 0 22px -6px rgb(255 190 40 / 0.8)',
                        }
                      : undefined
                  }
                >
                  <span className={clsx('truncate', isServed ? 'font-semibold text-ink-strong' : 'text-ink')}>
                    {phaseLabel(p)}
                  </span>
                  <div className="relative h-[11px] overflow-hidden rounded-full bg-[rgb(18_30_56/0.08)]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: isServed
                          ? 'linear-gradient(90deg, #FFC23A, #FFAE00)'
                          : s > boundary && margin > 0
                            ? 'linear-gradient(90deg, #FFC1AE, #FF7A59)'
                            : 'linear-gradient(90deg, #C6CEDC, #B3BDCF)',
                        boxShadow: isServed ? '0 0 14px rgb(255 176 0 / 0.85)' : undefined,
                      }}
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
                className="pointer-events-none absolute top-1 bottom-[-2px] w-0 border-l-[1.5px] border-dashed border-[#E5484D]"
                initial={false}
                animate={{ left: `calc(132px + 0.5rem + (100% - 132px - 40px - 1rem) * ${boundary / scale})` }}
                transition={reduced ? { duration: 0 } : value}
              >
                <span className="absolute -top-3.5 left-0 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-medium text-[#E5484D]">boundary</span>
              </motion.div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-[11.5px] text-ink">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-3 border-t-2 border-dashed border-[#E5484D]" />
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
