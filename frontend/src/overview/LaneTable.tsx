import clsx from 'clsx'
import { LANE_IDS, type LaneView } from '@/data/types'
import { useSim } from '@/data/store'
import { Panel } from '@/ui/Panel'
import { f1 } from '@/utils/format'
import { lampLabel, lampOf, laneLabel, movementOf } from '@/utils/signal'

/** The design's movement arrows, as a driver on that lane would turn. */
const MOVE_PATH: Record<string, string> = {
  Left: 'M15 20v-6a4 4 0 0 0-4-4H5M8.5 6.5L5 10l3.5 3.5',
  Straight: 'M12 20V5M8 8.5L12 4.5l4 4',
  Right: 'M9 20v-6a4 4 0 0 1 4-4h6M15.5 6.5L19 10l-3.5 3.5',
}

const DOT: Record<string, string> = {
  green: 'var(--dot-green)',
  amber: 'var(--dot-amber)',
  red: 'var(--dot-red)',
  off: '#C9D1DE',
}

/** Wait colour: under 20 s fine, 20–40 s building, 40 s+ long. */
function waitTone(s: number): string {
  return s >= 40 ? '#C4252F' : s >= 20 ? '#B45309' : '#067647'
}

/**
 * Twelve rows, fixed order, one per lane. Hover cross-highlights the lane
 * on the plate. Signal is a lit dot WITH the state spelled out beside it —
 * never colour alone.
 */
export function LaneTable({ lanes, powered }: { lanes: LaneView[]; powered: boolean }) {
  const hoverLane = useSim((s) => s.hoverLane)
  const setHoverLane = useSim((s) => s.setHoverLane)
  const byId = Object.fromEntries(lanes.map((l) => [l.lane_id, l]))
  const total = lanes.reduce((s, l) => s + l.vehicles, 0)
  const queued = lanes.filter((l) => l.vehicles > 0).length

  return (
    <Panel
      title="Lanes"
      meta={powered ? `${total} on approaches · ${queued}/12 lanes occupied` : `${LANE_IDS.length} inbound`}
      bodyClassName="flex flex-col px-3.5 pb-[18px]"
      className="flex-1"
    >
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-[rgb(18_30_56/0.08)] text-[10.5px] font-medium uppercase tracking-[0.04em] text-ink">
            <th className="px-1.5 py-1.5 font-medium">Lane</th>
            <th className="px-1.5 py-1.5 text-center font-medium">Signal</th>
            <th className="px-1.5 py-1.5 text-center font-medium">Vehicles</th>
            <th className="px-1.5 py-1.5 text-right font-medium">Avg wait</th>
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
                className={clsx('h-[31px] transition-[background-color,box-shadow] duration-150', active && 'bg-[rgb(47_107_255/0.07)]')}
                style={{
                  boxShadow: active ? 'inset 0 0 0 1px rgb(47 107 255 / 0.3)' : undefined,
                  transitionTimingFunction: 'var(--ease-out)',
                }}
              >
                <td className="rounded-l-lg px-1.5">
                  <span className="flex items-center gap-2 text-ink">
                    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 shrink-0 fill-none stroke-ink stroke-2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={MOVE_PATH[movementOf(id)]} />
                    </svg>
                    {laneLabel(id)}
                  </span>
                </td>
                <td className="px-1.5">
                  <span className="flex items-center justify-center gap-1.5 text-[11.5px] text-ink-mute">
                    <span
                      className="h-[11px] w-[11px] shrink-0 rounded-full"
                      style={{ background: DOT[lamp], boxShadow: lamp === 'off' ? undefined : `0 0 6px ${DOT[lamp]}` }}
                    />
                    <span className="w-[38px]">{lampLabel(lamp)}</span>
                  </span>
                </td>
                <td className="num px-1.5 text-center text-ink">{powered && l ? l.vehicles : '—'}</td>
                <td
                  className="num rounded-r-lg px-1.5 text-right font-medium"
                  style={{ color: powered && l ? waitTone(l.avg_wait) : 'var(--ink-mute)' }}
                >
                  {powered && l ? `${f1(l.avg_wait)} s` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-auto flex items-center justify-between border-t border-[rgb(18_30_56/0.08)] pt-3 text-[12.5px]">
        <span className="text-ink">Total vehicles on approaches</span>
        <span className="num text-[16px] font-medium text-ink-strong">{powered ? total : '—'}</span>
      </div>
    </Panel>
  )
}
