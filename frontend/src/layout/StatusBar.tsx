import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useSim } from '@/data/store'
import { isEvaluation, isLive } from '@/data/types'
import { useLiveClock } from '@/data/useLiveClock'
import { clock } from '@/utils/format'
import { modeMeta } from '@/utils/signal'
import { useRunStore } from '@/data/runState'
import { usePageContext } from '@/data/pageContext'
import { useSettings } from '@/data/settings'
import { RunControls } from './RunControls'

/**
 * Persistent top bar, sitting directly on the frosted container: white
 * title over the glass, then the scenario pill (gold rim), the run
 * controls, the simulated clock and the link pill — all dark-glass pills.
 *
 * Routine engine modes live in the Active-phase panel where they can be
 * explained; only the two genuine alerts surface here, alongside the
 * emergency-lane slot. The clock shows simulated time while the sim runs
 * and simply "Simulation paused" while it doesn't.
 */
export function StatusBar() {
  const latest = useSim((s) => s.latest)
  const lastLive = useSim((s) => s.lastLive)
  const link = useSim((s) => s.link)
  const { simTime, staleSeconds, tickAge, rate } = useLiveClock()
  const run = useRunStore((s) => s.state)
  const page = usePageContext()
  const setTarget = useSettings((s) => s.setTarget)

  // The bar reports the PAGE's run. A run of the other kind — an
  // evaluation while reading Overview, a demo while reading Performance —
  // is idle from here: no clock, no stale demo frame, no mode chip.
  const foreign = run?.available === true && run.running && !page.running
  const live = foreign ? null : isLive(latest) ? latest : lastLive
  // During an evaluation there is no demo frame, but there is a run:
  // the clock and the paused/ended states must not read as "waiting".
  const evaluating = !foreign && isEvaluation(latest) && run?.running === true
  const linkLost = link !== 'open' || staleSeconds > 3
  // The backend knows whether it is paused; ask it. The tick-age
  // heuristic is only the fallback for a backend with no control layer
  // (the evaluator's own dashboard), where nothing can answer.
  const paused =
    run?.available === true
      ? run.paused
      : !linkLost && live !== null && tickAge > 3
  const ended = run?.available === true && (!run.running || foreign)
  // The emergency band and the loud mode chip follow the page's run: the
  // demo frame here, or the evaluation's Trinetra side on Performance.
  const side = live ?? (evaluating && isEvaluation(latest) ? latest.ai : null)
  const mode = modeMeta(side?.decision.mode)

  // The pill's lamp: red when nothing is flowing (idle, link lost), amber
  // while it's held or doubtful (paused, connecting, stale), green live.
  const dot = ended || link === 'closed' ? 'red' : linkLost || paused ? 'amber' : 'green'

  return (
    <header className="flex h-[88px] shrink-0 items-center justify-between gap-4 pl-6 pr-5 text-[var(--bar-ink)]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0">
          <h1
            className="display truncate text-[23px] font-semibold leading-[1.15] tracking-[0.03em] text-white"
            style={{ textShadow: '0 2px 14px rgb(0 0 0 / 0.55)' }}
          >
            Adaptive signal control
          </h1>
          <p className="mt-1.5 truncate text-[13.5px] text-[var(--bar-mute)]" style={{ textShadow: '0 1px 8px rgb(0 0 0 / 0.6)' }}>
            Single 4-way junction <span className="mx-1.5">•</span> Digital twin <span className="mx-1.5">•</span> AI-powered traffic intelligence
          </p>
        </div>
        {side && mode.loud && (
          <span className="loud-chip shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white">{mode.label}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {/* The page's scenario — what is running here, or what Start would
            run — and the way to change it: Settings opens choosing for THIS
            page, so a click from Performance picks the evaluation's scenario. */}
        <Link
          to="/settings"
          onClick={() => {
            if (!page.path.startsWith('/settings')) setTarget(page.kind === 'evaluation' ? 'performance' : 'overview')
          }}
          className="scenario-pill flex h-11 items-center gap-2.5 rounded-full pl-4 pr-[18px] text-[13.5px] text-white"
          title={
            page.running
              ? `${page.name} is running ${page.scenarioLabel} — change the scenario on Simulation Settings for the next run`
              : `${page.name} will run ${page.scenarioLabel} — change it on Simulation Settings`
          }
        >
          <SlidersHorizontal size={16} aria-hidden />
          <span style={{ color: '#F5B632' }}>Scenario:</span>
          <span className="whitespace-nowrap font-medium">{page.scenarioLabel}</span>
          <ChevronDown size={14} strokeWidth={2.2} aria-hidden className="ml-1" />
        </Link>

        <RunControls />

        <div className="min-w-[132px] text-right" style={{ textShadow: '0 1px 8px rgb(0 0 0 / 0.6)' }}>
          {live === null && !evaluating ? (
            <div className="text-[13.5px] text-white">{ended ? 'No simulation running' : 'Waiting for simulation'}</div>
          ) : paused ? (
            <div className="text-[13.5px] font-medium text-white">Simulation paused</div>
          ) : ended ? (
            <div className="text-[13.5px] font-medium text-white">Run ended</div>
          ) : (
            <>
              <div className="num text-[17px] font-semibold leading-none text-white">{simTime == null ? '--:--:--' : clock(simTime)}</div>
              <div className="mt-1 text-[11.5px] text-[var(--bar-mute)]">
                simulated time
                {rate != null && (
                  <>
                    {' '}
                    · <span className="num">×{rate.toFixed(1)}</span> real time
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="glass-control flex h-[42px] items-center gap-2.5 rounded-full pl-3.5 pr-4 text-[13.5px] font-medium">
          <span className={clsx('status-dot', `status-dot-${dot}`, dot === 'green' && 'status-dot-beat')} />
          <span className="whitespace-nowrap">
            {link === 'connecting'
              ? 'Connecting'
              : link === 'closed'
                ? `Link lost — last update ${Math.round(staleSeconds)} s ago`
                : ended
                  ? 'Idle'
                  : linkLost
                    ? `No data for ${Math.round(staleSeconds)} s`
                    : paused
                      ? 'Paused'
                      : 'Live'}
          </span>
        </div>
      </div>
    </header>
  )
}
