import clsx from 'clsx'
import { LANE_IDS, type LaneView } from '@/data/types'
import { useSim } from '@/data/store'
import { Panel } from '@/ui/Panel'
import { f1 } from '@/utils/format'
import { lampColor, lampLabel, lampOf, movementOf } from '@/utils/signal'

/**
 * Twelve rows, fixed order, one per lane. Hover cross-highlights the lane
 * on the plate. Signal is a coloured chip with the state spelled out —
 * never colour alone.
 */
export function LaneTable({ lanes, powered }: { lanes: LaneView[]; powered: boolean }) {
  const hoverLane = useSim((s) => s.hoverLane)
  const setHoverLane = useSim((s) => s.setHoverLane)
  const byId = Object.fromEntries(lanes.map((l) => [l.lane_id, l]))
  const total = lanes.reduce((s, l) => s + l.vehicles, 0)

  return (
    <Panel title="Lanes" meta={`${LANE_IDS.length} inbound`} bodyClassName="flex flex-col" className="flex-1">
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="text-[12px] font-medium text-ink-mute">
            <th className="px-2 py-1 font-medium">Lane</th>
            <th className="px-2 py-1 font-medium">Movement</th>
            <th className="px-2 py-1 font-medium">Signal</th>
            <th className="px-2 py-1 text-right font-medium">Vehicles</th>
            <th className="px-2 py-1 text-right font-medium">Avg wait</th>
          </tr>
        </thead>
        <tbody>
          {LANE_IDS.map((id) => {
            const l = byId[id]
            const lamp = powered && l ? lampOf(l.signal) : 'off'
            const active = hoverLane === id
            return (
              <tr
                key={id}
                onMouseEnter={() => setHoverLane(id)}
                onMouseLeave={() => setHoverLane(null)}
                className={clsx('h-7 border-t border-rule-soft transition-colors', active && 'bg-hover')}
              >
                <td className="num px-2 font-medium text-ink-strong">{id}</td>
                <td className="px-2 text-ink">{movementOf(id)}</td>
                <td className="px-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: lampColor(lamp) }} />
                    <span className="num text-[12px] font-semibold" style={{ color: lampColor(lamp) }}>
                      {lampLabel(lamp)}
                    </span>
                  </span>
                </td>
                <td className="num px-2 text-right text-ink-strong">{powered && l ? l.vehicles : '—'}</td>
                <td className="num px-2 text-right text-ink">{powered && l ? `${f1(l.avg_wait)} s` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-auto flex items-center justify-between border-t border-rule-soft pt-3 pb-1 text-[13px]">
        <span className="text-ink">Total vehicles on approaches</span>
        <span className="num text-[16px] text-ink-strong">{powered ? total : '—'}</span>
      </div>
    </Panel>
  )
}
