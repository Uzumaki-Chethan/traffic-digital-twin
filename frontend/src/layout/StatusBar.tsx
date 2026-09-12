import clsx from 'clsx'
import { useSim } from '@/data/store'
import { isLive } from '@/data/types'
import { useLiveClock } from '@/data/useLiveClock'
import { clock } from '@/utils/format'
import { APPROACH_NAME, modeMeta } from '@/utils/signal'
import { approachOf } from '@/data/types'

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

  const live = isLive(latest) ? latest : lastLive
  const linkLost = link !== 'open' || staleSeconds > 3
  const paused = !linkLost && live !== null && tickAge > 3
  const emergency = live?.emergency_lanes ?? []
  const mode = modeMeta(live?.decision.mode)

  return (
    <header
      className="bar-flow flex h-14 shrink-0 items-center justify-between px-4 text-[var(--bar-ink)]"
      style={{ borderBottom: '1px solid var(--bar-rule)' }}
    >
      <div className="flex items-center gap-3">
        <div>
          <div className="display text-[15px]">Adaptive signal control</div>
          <div className="text-[12px]">
            Single 4-way intersection · <span className="num">SUMO node C</span> · keep-left
          </div>
        </div>
        {live && mode.loud && (
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

        <div className="text-right">
          {live === null ? (
            <div className="text-[13px]">Waiting for simulation</div>
          ) : paused ? (
            <div className="text-[14px] font-semibold">Simulation paused</div>
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
              link === 'open' && !linkLost && !paused ? 'bg-lamp-green' : paused ? 'bg-lamp-amber' : 'bg-[var(--bar-ink)]',
            )}
          />
          <span>
            {link === 'connecting'
              ? 'Connecting'
              : link === 'closed'
                ? `Link lost — last update ${Math.round(staleSeconds)} s ago`
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
