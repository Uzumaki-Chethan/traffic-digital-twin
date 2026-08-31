import type { Approach, LaneView } from '@/types/snapshot'
import { approachOf, APPROACH_LANES } from '@/types/snapshot'
import { signalColor, signalLabel } from '@/utils/theme'
import { fmtApproach, fmtLaneMovement } from '@/utils/format'

const NORM_VEHICLE_COUNT = 20 // matches decision_engine.py's normalization ceiling

function groupByApproach(lanes: LaneView[]): Record<Approach, LaneView[]> {
  const groups: Record<Approach, LaneView[]> = { N: [], S: [], E: [], W: [] }
  const byId = Object.fromEntries(lanes.map((l) => [l.lane_id, l]))
  for (const laneId of APPROACH_LANES) {
    const approach = approachOf(laneId)
    groups[approach].push(byId[laneId] ?? { lane_id: laneId, vehicles: 0, avg_wait: 0, signal: 'r' })
  }
  return groups
}

export function LaneDensityGrid({ lanes }: { lanes: LaneView[] }) {
  const groups = groupByApproach(lanes)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {(Object.keys(groups) as Approach[]).map((approach) => (
        <div key={approach} className="rounded-md border border-[var(--color-border-soft)] bg-[var(--color-panel-inset)] p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
            {fmtApproach(approach)}
          </div>
          <div className="space-y-2">
            {groups[approach].map((lane) => {
              const pct = Math.min(100, (lane.vehicles / NORM_VEHICLE_COUNT) * 100)
              return (
                <div key={lane.lane_id}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--color-text-dim)]">{fmtLaneMovement(lane.lane_id)}</span>
                    <span className="font-mono tabular text-[var(--color-text)]">{lane.vehicles}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-panel-raised)]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: signalColor(lane.signal) }}
                      title={signalLabel(lane.signal)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
