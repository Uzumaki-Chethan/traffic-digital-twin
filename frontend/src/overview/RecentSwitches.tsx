import { ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { Panel } from '@/ui/Panel'
import type { PhaseHistoryEntry } from '@/data/types'
import { getSamples, useLiveHistory } from '@/data/liveHistory'
import { phaseLabel, modeMeta } from '@/utils/signal'
import { clock } from '@/utils/format'

const SHOWN = 5

interface Switch {
  t: number
  from: string
  to: string
  /** The rule the engine switched on, when this page saw that tick. */
  mode: string | null
  /** How long the ended phase had run, sim seconds; null if it began
   * before the window the snapshot carries. */
  held: number | null
}

/**
 * The last few phase changes, newest first: when, what gave way to
 * what, how long the ended phase had run, and on which rule.
 *
 * The switches themselves come from the snapshot's own `phase_history`
 * — the 60 s band every frame carries, so the list is right the moment
 * the page opens, mid-run. The rule comes from the per-tick history this
 * page keeps (data/liveHistory.ts), which only knows ticks it has seen:
 * a switch from before the page opened shows without one, honestly,
 * rather than with a guess.
 */
export function RecentSwitches({ history, powered }: { history: PhaseHistoryEntry[]; powered: boolean }) {
  // Subscribing to the revision is what re-renders this as ticks arrive.
  useLiveHistory((s) => s.revision)
  const samples = getSamples()

  const switches: Switch[] = []
  for (let i = history.length - 1; i > 0 && switches.length < SHOWN; i--) {
    const cur = history[i]
    const prev = history[i - 1]
    if (cur.phase === prev.phase) continue
    // Walk back to where the ended phase began, if the window holds it.
    let start = i - 1
    while (start > 0 && history[start - 1].phase === prev.phase) start--
    const held = start > 0 ? cur.time - history[start].time : null
    const sample = samples.find((s) => Math.abs(s.t - cur.time) < 0.5)
    switches.push({ t: cur.time, from: prev.phase, to: cur.phase, mode: sample?.mode ?? null, held })
  }

  return (
    <Panel
      title="Recent switches"
      meta={powered && switches.length > 0 ? 'last 60 s' : undefined}
      className="w-full"
      bodyClassName="px-3.5 pb-3 pt-1"
    >
      {!powered ? (
        <div className="py-3 text-center text-[12.5px] text-ink-mute">No simulation running.</div>
      ) : switches.length === 0 ? (
        <div className="py-3 text-center text-[12.5px] text-ink-mute">No phase change in the last 60 s.</div>
      ) : (
        <ol className="flex flex-col">
          {switches.map((s) => {
            const mode = s.mode ? modeMeta(s.mode) : null
            return (
              <li
                key={s.t}
                className="grid grid-cols-[56px_1fr_auto] items-center gap-2 border-b border-rule-soft py-[3px] text-[12px] last:border-b-0"
                title={
                  `${phaseLabel(s.from)} gave way to ${phaseLabel(s.to)}` +
                  (s.held != null ? ` after ${Math.round(s.held)} s` : '') +
                  (mode ? ` (${mode.label.toLowerCase()})` : '')
                }
              >
                <span className="num text-ink-mute">{clock(s.t)}</span>
                <span className="flex min-w-0 items-center gap-1 text-ink">
                  <span className="truncate">{phaseLabel(s.from)}</span>
                  <ArrowRight size={11} aria-hidden className="shrink-0 text-ink-mute" />
                  <span className="truncate font-semibold text-ink-strong">{phaseLabel(s.to)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="num text-ink-mute">{s.held != null ? `${Math.round(s.held)} s` : '—'}</span>
                  {mode && (
                    <span
                      className={clsx(
                        'rounded-full border px-2 py-0.5 text-[11px]',
                        mode.loud ? 'border-[var(--signal-red)] text-[var(--signal-red)]' : 'border-rule text-ink',
                      )}
                    >
                      {mode.label}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
