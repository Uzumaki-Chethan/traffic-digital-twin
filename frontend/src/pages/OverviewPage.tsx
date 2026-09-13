import { useSim } from '@/data/store'
import { useRunStore } from '@/data/runState'
import { isLive, type LiveSnapshot } from '@/data/types'
import { Panel } from '@/ui/Panel'
import { Reveal } from '@/ui/Reveal'
import { TwinViewport } from '@/overview/TwinViewport'
import { PhasePanel } from '@/overview/PhasePanel'
import { LaneTable } from '@/overview/LaneTable'
import { RingBarrierHistory } from '@/overview/RingBarrierHistory'
import { MetricsStrip } from '@/overview/MetricsStrip'
import { PredictionPanel } from '@/overview/PredictionPanel'
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
  const run = useRunStore((s) => s.state)

  const live = isLive(latest) ? latest : lastLive
  // A STOPPED run is not a paused one: the traffic it was showing no
  // longer exists, so the junction goes dark and clears rather than
  // holding a frozen last frame that looks live. Pausing deliberately
  // does NOT do this — a paused run still has those vehicles sitting
  // where they are. Only asked of a backend that can actually tell us.
  const ended = run?.available === true && !run.running
  const powered = live !== null && !ended
  const snap = powered ? (live ?? EMPTY) : EMPTY
  const dimmed = link !== 'open' && powered

  const greens = snap.lanes.filter((l) => lampOf(l.signal) === 'green').length
  const reds = snap.lanes.filter((l) => lampOf(l.signal) === 'red').length

  return (
    <div className={dimmed ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <div className="grid grid-cols-12 gap-2">
        {/* The twin and, under it, the ML layer — stacked as siblings so
            the prediction panel fills the space the plate leaves rather
            than sitting as a card inside a card. */}
        <div className="col-span-8 flex min-w-0 flex-col gap-2">
          <Panel
            title="Digital Twin"
            meta={
              powered ? (
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-signal-green" /> green {greens}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-signal-red" /> red {reds}
                  </span>
                  <span>{snap.metrics.vehicles} vehicles</span>
                </span>
              ) : undefined
            }
            bodyClassName="px-2 pb-2"
          >
            <TwinViewport lanes={snap.lanes} emergencyLanes={snap.emergency_lanes} vehicles={snap.vehicles} powered={powered} />
          </Panel>

          <Reveal index={3}>
            <PredictionPanel prediction={snap.prediction} powered={powered} />
          </Reveal>
        </div>

        <div className="col-span-4 flex min-h-0 flex-col gap-2">
          <Reveal index={1}>
            <PhasePanel decision={snap.decision} signal={snap.signal} />
          </Reveal>
          <Reveal index={2}>
            <LaneTable lanes={snap.lanes} powered={powered} />
          </Reveal>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <Reveal index={4}>
          <RingBarrierHistory history={snap.phase_history} />
        </Reveal>
        <Reveal index={5}>
          <MetricsStrip metrics={snap.metrics} history={snap.phase_history} powered={powered} />
        </Reveal>
      </div>
    </div>
  )
}
