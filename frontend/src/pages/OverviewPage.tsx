import { useSim } from '@/data/store'
import { useRunStore } from '@/data/runState'
import { usePageContext } from '@/data/pageContext'
import { isLive, type LiveSnapshot } from '@/data/types'
import { Panel } from '@/ui/Panel'
import { Reveal } from '@/ui/Reveal'
import { TwinViewport } from '@/overview/TwinViewport'
import { PhasePanel } from '@/overview/PhasePanel'
import { LaneTable } from '@/overview/LaneTable'
import { RingBarrierHistory } from '@/overview/RingBarrierHistory'
import { MetricsStrip } from '@/overview/MetricsStrip'
import { PredictionPanel } from '@/overview/PredictionPanel'
import { ScoreLedger } from '@/overview/ScoreLedger'
import { RecentSwitches } from '@/overview/RecentSwitches'
import { DispatchBar } from '@/layout/DispatchBar'
import { IncidentBar } from '@/layout/IncidentBar'
import { leadingIncidentTool, showsIncidentControls } from '@/data/scenarios'
import { lampOf, phaseKey } from '@/utils/signal'

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
 * Plate-dominant split (≈ 1.78 : 1), the instrument stack on the right,
 * then the phase history and — at the bottom, where the owner keeps them —
 * the five KPI tiles. Before the first
 * tick the plate renders unpowered with one line of instruction — never
 * a spinner. On a link drop the last live snapshot stays on screen.
 *
 * An evaluation running on Performance is not this page's run: the page
 * sits idle and dark exactly as it does when nothing runs, rather than
 * pointing elsewhere or replaying the last demo frame.
 */
export function OverviewPage() {
  // Per decision tick, not per motion frame (Section 37.6): vehicles and
  // the clock have their own paths. (Not useDeferredValue — with motion
  // frames arriving continuously the deferred render was starved and the
  // page stuck on "not running".)
  const latest = useSim((s) => s.latestTick)
  const lastLive = useSim((s) => s.lastLive)
  const link = useSim((s) => s.link)
  const run = useRunStore((s) => s.state)
  const { scenario } = usePageContext()

  const live = isLive(latest) ? latest : lastLive
  // A STOPPED run is not a paused one: the traffic it was showing no
  // longer exists, so the junction goes dark and clears rather than
  // holding a frozen last frame that looks live. Pausing deliberately
  // does NOT do this — a paused run still has those vehicles sitting
  // where they are. Only asked of a backend that can actually tell us.
  // A run of another kind (an evaluation) counts as nothing running here.
  const ended = run?.available === true && (!run.running || run.kind === 'evaluation')
  const powered = live !== null && !ended
  const snap = powered ? (live ?? EMPTY) : EMPTY
  const dimmed = link !== 'open' && powered
  // The scenario the run is actually playing, not the id — running the
  // Rain scenario is the only thing that turns the falling streaks on.
  const raining = powered && scenario.startsWith('rain')
  const incidentFirst = leadingIncidentTool(scenario) === 'incident'
  const showIncidentControls = showsIncidentControls(scenario)

  const greens = snap.lanes.filter((l) => lampOf(l.signal) === 'green').length
  const reds = snap.lanes.filter((l) => lampOf(l.signal) === 'red').length

  return (
    <div className={dimmed ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <div className="grid grid-cols-[minmax(0,1.78fr)_minmax(0,1fr)] gap-3.5 max-[1100px]:grid-cols-1">
        {/* The twin and, under it, the ML layer — stacked as siblings so
            the prediction panel fills the space the plate leaves rather
            than sitting as a card inside a card. */}
        <div className="flex min-w-0 flex-col gap-3.5">
          <Panel
            title="Digital twin"
            glyph={powered ? (greens > 0 ? 'green' : 'red') : 'red'}
            titleExtra={<LiveBadge on={powered && !dimmed} />}
            meta={
              powered ? (
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-dot-green" /> green {greens}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-dot-red" /> red {reds}
                  </span>
                  <span>{snap.metrics.vehicles} vehicles</span>
                </span>
              ) : undefined
            }
            bodyClassName="px-3.5 pb-3.5"
          >
            <TwinViewport
              lanes={snap.lanes}
              emergencyLanes={snap.emergency_lanes}
              vehicles={snap.vehicles}
              powered={powered}
              releaseKey={phaseKey(snap.sim_time, snap.decision.duration)}
              raining={raining}
            />
            {showIncidentControls && (
              <div className="mt-3 flex flex-wrap gap-2.5">
                {incidentFirst ? (
                  <>
                    <IncidentBar />
                    <DispatchBar />
                  </>
                ) : (
                  <>
                    <DispatchBar />
                    <IncidentBar />
                  </>
                )}
              </div>
            )}
          </Panel>

          <Reveal index={3}>
            <PredictionPanel prediction={snap.prediction} powered={powered} />
          </Reveal>

          {/* The explainability row: the decision boundary and the last
              few switches. Fills the column to the lane table's height
              rather than leaving the space under the prediction empty. */}
          <div className="grid flex-1 grid-cols-2 items-stretch gap-3.5 max-[860px]:grid-cols-1">
            <Reveal index={4} className="flex min-h-0">
              <ScoreLedger decision={snap.decision} powered={powered} />
            </Reveal>
            <Reveal index={4} className="flex min-h-0">
              <RecentSwitches history={snap.phase_history} powered={powered} />
            </Reveal>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-3.5">
          <Reveal index={1}>
            <PhasePanel decision={snap.decision} signal={snap.signal} powered={powered} />
          </Reveal>
          <Reveal index={2}>
            <LaneTable lanes={snap.lanes} powered={powered} />
          </Reveal>
        </div>
      </div>

      <div className="mt-3.5 flex flex-col gap-3.5">
        <Reveal index={5}>
          <RingBarrierHistory history={snap.phase_history} />
        </Reveal>
        <Reveal index={6}>
          <MetricsStrip metrics={snap.metrics} history={snap.phase_history} powered={powered} />
        </Reveal>
      </div>
    </div>
  )
}

/** "Live simulation" beside the twin's title: a beating dot while frames flow. */
function LiveBadge({ on }: { on: boolean }) {
  return (
    <span className={on ? 'ml-1 inline-flex items-center gap-2 text-[12.5px] font-normal text-[#12A150]' : 'ml-1 inline-flex items-center gap-2 text-[12.5px] font-normal text-ink-mute'}>
      <span className={on ? 'status-dot status-dot-green status-dot-beat !h-[9px] !w-[9px]' : 'h-[9px] w-[9px] rounded-full bg-[#C9D1DE]'} />
      {on ? 'Live simulation' : 'Not running'}
    </span>
  )
}
