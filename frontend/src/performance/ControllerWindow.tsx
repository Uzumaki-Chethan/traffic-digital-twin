import { Panel } from '@/ui/Panel'
import { TwinViewport } from '@/overview/TwinViewport'
import type { SideView } from '@/data/types'
import type { ViewState } from '@/overview/usePanZoom'
import { phaseLabel } from '@/utils/signal'
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
  sharedView,
}: {
  title: string
  side: SideView | null
  powered: boolean
  /** Both windows share one pan/zoom so the two are always framed alike. */
  sharedView: ViewState
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
        ) : undefined
      }
      bodyClassName="px-2 pb-2"
    >
      <TwinViewport lanes={lanes} emergencyLanes={[]} vehicles={side?.vehicles} powered={powered} allow3d={false} sharedView={sharedView} />
    </Panel>
  )
}
