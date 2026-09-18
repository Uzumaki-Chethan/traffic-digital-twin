import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import { useSim } from '@/data/store'
import { isEvaluation, isLive } from '@/data/types'
import { useLiveClock } from '@/data/useLiveClock'
import { clock } from '@/utils/format'
import { APPROACH_NAME, modeMeta } from '@/utils/signal'
import { approachOf } from '@/data/types'
import { useRunStore } from '@/data/runState'
import { usePageContext } from '@/data/pageContext'
import { useSettings } from '@/data/settings'
import { RunControls } from './RunControls'

/**
 * Persistent status bar, drawn as one blended red -> amber -> green sweep
 * in three equal parts (see --bar-grad). Everything on it is set in
 * ink-strong: on a saturated ground even a mid ink drops below 4.5:1, so
 * hierarchy here comes from size and weight rather than ink level.
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
  const emergency = side?.emergency_lanes ?? []
  const mode = modeMeta(side?.decision.mode)

  return (
    <header
      className="bar-flow flex h-14 shrink-0 items-center justify-between px-4 text-[var(--bar-ink)]"
      style={{ borderBottom: '1px solid var(--bar-rule)' }}
    >
      <div className="flex items-center gap-3">
        <div>
          <div className="display text-[15px]">Adaptive signal control</div>
          <div className="text-[12px]">
            Single 4-way junction
          </div>
        </div>
        {side && mode.loud && (
          <>
            <span className="h-5 w-px" style={{ background: 'var(--bar-rule)' }} />
            <span className="rounded-chip bg-[var(--signal-red)] px-2.5 py-0.5 text-[12.5px] font-semibold text-white">
              {mode.label}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        {emergency.length > 0 && (
          <div className="flex items-center gap-2 rounded-control border border-alert bg-alert-wash px-2 py-1">
            <span className="hatch-alert h-4 w-4 rounded-sm" aria-hidden />
            <span className="text-[12.5px] font-semibold text-alert">
              Emergency vehicle — {[...new Set(emergency.map(approachOf))].map((a) => APPROACH_NAME[a]).join(', ')}
            </span>
          </div>
        )}

        {/* The page's scenario — what is running here, or what Start would
            run — and the way to change it: Settings opens choosing for THIS
            page, so a click from Performance picks the evaluation's scenario. */}
        <Link
          to="/settings"
          onClick={() => {
            if (!page.path.startsWith('/settings')) setTarget(page.kind === 'evaluation' ? 'performance' : 'overview')
          }}
          className="flex items-center gap-1.5 rounded-control border border-[var(--bar-rule)] px-2.5 py-1 text-[12.5px] font-medium text-[var(--bar-ink)] transition-colors hover:bg-[rgb(36_26_16/0.12)]"
          title={
            page.running
              ? `${page.name} is running ${page.scenarioLabel} — change the scenario on Simulation Settings for the next run`
              : `${page.name} will run ${page.scenarioLabel} — change it on Simulation Settings`
          }
        >
          <SlidersHorizontal size={13} aria-hidden />
          <span className="opacity-80">Scenario:</span>
          <span className="font-semibold">{page.scenarioLabel}</span>
        </Link>

        <RunControls />

        <div className="text-right">
          {live === null && !evaluating ? (
            <div className="text-[13px]">{ended ? 'No simulation running' : 'Waiting for simulation'}</div>
          ) : paused ? (
            <div className="text-[14px] font-semibold">Simulation paused</div>
          ) : ended ? (
            <div className="text-[14px] font-semibold">Run ended</div>
          ) : (
            <>
              <div className="num text-[16px] font-semibold leading-none">{simTime == null ? '--:--:--' : clock(simTime)}</div>
              <div className="mt-0.5 text-[12px]">
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

        <span className="h-5 w-px" style={{ background: 'var(--bar-rule)' }} />

        <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
          <span
            className={clsx(
              'h-2.5 w-2.5 rounded-full ring-1 ring-[var(--bar-rule)]',
              link === 'open' && !linkLost && !paused && !ended
                ? 'bg-lamp-green'
                : paused || ended
                  ? 'bg-lamp-amber'
                  : 'bg-[var(--bar-ink)]',
            )}
          />
          <span>
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
