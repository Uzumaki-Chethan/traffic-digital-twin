import { Panel } from '@/ui/Panel'
import { TwinViewport } from '@/overview/TwinViewport'
import type { SideView } from '@/data/types'
import type { View, ViewState } from '@/overview/usePanZoom'
import { phaseKey, phaseLabel } from '@/utils/signal'
import { f1 } from '@/utils/format'

/**
 * One controller's junction during an evaluation — the same plate
 * Overview draws, fed from that controller's own simulation. Plan view
 * only; two three.js scenes at once is not a comparison anyone asked for.
 */
export function ControllerWindow({
  title,
  side,
  powered,
  view,
  matchView,
  simTime,
  note,
  motionSide,
}: {
  title: string
  side: SideView | null
  powered: boolean
  /** One line for the header while there is nothing to show. */
  note?: string
  /** Which evaluation fleet this window draws. */
  motionSide: 'ai' | 'baseline'
  /** The frame's simulated time, for the plate's release timing. */
  simTime?: number
  /** This window's own pan/zoom, owned by the page so the other window can read it. */
  view: ViewState
  /** The other window's framing, offered as a one-press "Match". */
  matchView: { label: string; view: View }
}) {
  const lanes = side?.lanes ?? []
  return (
    <Panel
      title={title}
      meta={
        side && powered ? (
          <span className="flex items-center gap-3">
            <span>
              <span className="text-ink-strong">{phaseLabel(side.decision.active_phase)}</span>
              {side.signal?.is_yellow ? ' · amber' : ''}
            </span>
            <span>{side.metrics.vehicles} vehicles</span>
            <span>
              wait <span className="text-ink-strong">{f1(side.metrics.avg_wait)}</span> s
            </span>
          </span>
        ) : (
          note
        )
      }
      bodyClassName="px-2 pb-2"
    >
      <TwinViewport
        lanes={lanes}
        emergencyLanes={[]}
        vehicles={side?.vehicles}
        powered={powered}
        allow3d={false}
        sharedView={view}
        matchView={matchView}
        motionSide={motionSide}
        releaseKey={phaseKey(simTime, side?.decision.duration)}
      />
    </Panel>
  )
}
