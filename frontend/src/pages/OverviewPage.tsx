import { useSim } from '@/data/store'
import { isLive, type LiveSnapshot } from '@/data/types'
import { Panel } from '@/ui/Panel'
import { TwinViewport } from '@/overview/TwinViewport'
import { PhasePanel } from '@/overview/PhasePanel'
import { LaneTable } from '@/overview/LaneTable'
import { RingBarrierHistory } from '@/overview/RingBarrierHistory'
import { MetricsStrip } from '@/overview/MetricsStrip'
import { lampOf } from '@/utils/signal'

const EMPTY: LiveSnapshot = {
  sim_time: 0,
  signal: null,
  metrics: { vehicles: 0, avg_speed: 0, avg_wait: 0, queue: 0, stopped: 0 },
  lanes: [],
  decision: { active_phase: '—', mode: '', switched: false, reason: '', duration: 0, phase_scores: {} },
  emergency_lanes: [],
  prediction: null,
  comparison: null,
  phase_history: [],
}

/**
 * Stitch's approved layout: plate-dominant 8/4 split, instrument stack
 * on the right, history and metrics as low bands below. Before the first
 * tick the plate renders unpowered with one line of instruction — never
 * a spinner. On a link drop the last live snapshot stays on screen.
 */
export function OverviewPage() {
  const latest = useSim((s) => s.latest)
  const lastLive = useSim((s) => s.lastLive)
  const link = useSim((s) => s.link)

  const live = isLive(latest) ? latest : lastLive
  const powered = live !== null
  const snap = live ?? EMPTY
  const dimmed = link !== 'open' && powered

  const greens = snap.lanes.filter((l) => lampOf(l.signal) === 'green').length
  const reds = snap.lanes.filter((l) => lampOf(l.signal) === 'red').length

  return (
    <div className={dimmed ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <div className="grid grid-cols-12 gap-2">
        <Panel
          title="Digital Twin"
          meta={
            powered ? (
              <span className="flex items-center gap-3">
                <span>keep-left</span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-signal-green" /> green {greens}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-signal-red" /> red {reds}
                </span>
              </span>
            ) : (
              'keep-left'
            )
          }
          className="col-span-8"
          bodyClassName="relative px-2 pb-2"
        >
          <TwinViewport lanes={snap.lanes} emergencyLanes={snap.emergency_lanes} powered={powered} />
          {!powered && (
            <div className="absolute inset-x-4 bottom-4 rounded-control border border-rule bg-plate px-3 py-2 text-[13px] text-ink" style={{ boxShadow: 'var(--shadow-panel)' }}>
              No simulation running. Start <span className="num">python app.py</span> from <span className="num">backend/</span> to begin.
            </div>
          )}
        </Panel>

        <div className="col-span-4 flex min-h-0 flex-col gap-2">
          <PhasePanel decision={snap.decision} signal={snap.signal} />
          <LaneTable lanes={snap.lanes} powered={powered} />
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <RingBarrierHistory history={snap.phase_history} />
        <MetricsStrip metrics={snap.metrics} history={snap.phase_history} powered={powered} />
      </div>
    </div>
  )
}
