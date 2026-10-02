import clsx from 'clsx'
import type { LaneView } from '@/data/types'
import { LANE_IDS } from '@/data/types'
import { useSim } from '@/data/store'
import { Panel } from '@/ui/Panel'
import { f1 } from '@/utils/format'
import { lampOf, laneLabel } from '@/utils/signal'
import { SignalChip } from '@/ui/SignalChip'

export interface LaneWaitMean {
  average_wait_seconds: number
  sample_count: number
}

/**
 * The lane ledger: what each lane is doing right now beside how it has
 * behaved across this run. Both columns come from the live stream — the
 * left pair is the latest tick, the right pair is every tick so far —
 * so they are separated by a rule because they are different time
 * bases, not different sources.
 */
export function LaneLedger({
  lanes,
  waits,
  powered,
}: {
  lanes: LaneView[]
  waits: Record<string, LaneWaitMean>
  powered: boolean
}) {
  const hoverLane = useSim((s) => s.hoverLane)
  const setHoverLane = useSim((s) => s.setHoverLane)
  const byId = Object.fromEntries(lanes.map((l) => [l.lane_id, l]))

  return (
    <Panel title="Lane ledger" meta={powered ? 'now + this run' : 'this run'}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="text-[12px] text-ink-mute">
              <th className="px-2 pb-1 font-medium">Lane</th>
              <th className="px-2 pb-1 font-medium">Signal now</th>
              <th className="px-2 pb-1 text-right font-medium">Vehicles now</th>
              <th className="px-2 pb-1 text-right font-medium">Wait now</th>
              <th className="border-l border-rule px-2 pb-1 text-right font-medium">Mean wait</th>
              <th className="px-2 pb-1 text-right font-medium">Ticks</th>
            </tr>
          </thead>
          <tbody>
            {LANE_IDS.map((id, i) => {
              const l = byId[id]
              const lamp = powered && l ? lampOf(l.signal) : 'off'
              const rec = waits[id]
              const active = hoverLane === id
              const newApproach = i > 0 && id[0] !== LANE_IDS[i - 1][0]
              return (
                <tr
                  key={id}
                  onMouseEnter={() => setHoverLane(id)}
                  onMouseLeave={() => setHoverLane(null)}
                  className={clsx(
                    'h-7 transition-colors',
                    newApproach ? 'border-t border-rule' : 'border-t border-rule-soft',
                    active && 'bg-hover',
                  )}
                >
                  <td className="px-2 text-ink-strong">{laneLabel(id)}</td>
                  <td className="px-2">
                    <SignalChip lamp={lamp} />
                  </td>
                  <td className="num px-2 text-right text-ink-strong">{powered && l ? l.vehicles : '—'}</td>
                  <td className="num px-2 text-right text-ink">{powered && l ? `${f1(l.avg_wait)} s` : '—'}</td>
                  <td className="num border-l border-rule px-2 text-right text-ink-strong">
                    {rec ? `${f1(rec.average_wait_seconds)} s` : '—'}
                  </td>
                  <td className="num px-2 text-right text-ink-mute">{rec ? rec.sample_count.toLocaleString() : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 border-t border-rule-soft pt-2 text-[12px] text-ink-mute">
        <span className="text-ink">Now</span> is the latest tick. <span className="text-ink">Mean wait</span> is that
        lane&rsquo;s average across every tick of this run so far.
      </div>
    </Panel>
  )
}
