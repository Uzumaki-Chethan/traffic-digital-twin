import clsx from 'clsx'
import type { LaneWaitTimes } from '@/data/api'
import type { LaneView } from '@/data/types'
import { LANE_IDS } from '@/data/types'
import { useSim } from '@/data/store'
import { Panel } from '@/ui/Panel'
import { f1 } from '@/utils/format'
import { APPROACH_NAME, lampColor, lampLabel, lampOf, movementOf } from '@/utils/signal'

/**
 * The lane ledger: what each lane is doing right now beside what it
 * typically does. "Now" comes from the live snapshot; "recorded" is the
 * mean over every run in the database — two different time bases, so
 * they are labelled and separated by a rule rather than mixed.
 */
export function LaneLedger({ lanes, waits, powered }: { lanes: LaneView[]; waits: LaneWaitTimes | null; powered: boolean }) {
  const hoverLane = useSim((s) => s.hoverLane)
  const setHoverLane = useSim((s) => s.setHoverLane)
  const byId = Object.fromEntries(lanes.map((l) => [l.lane_id, l]))

  return (
    <Panel title="Lane ledger" meta={powered ? 'live + recorded' : 'recorded only'}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="text-[12px] text-ink-mute">
              <th className="px-2 pb-1 font-medium">Lane</th>
              <th className="px-2 pb-1 font-medium">Approach</th>
              <th className="px-2 pb-1 font-medium">Movement</th>
              <th className="px-2 pb-1 font-medium">Signal now</th>
              <th className="px-2 pb-1 text-right font-medium">Vehicles now</th>
              <th className="px-2 pb-1 text-right font-medium">Wait now</th>
              <th className="border-l border-rule px-2 pb-1 text-right font-medium">Mean wait</th>
              <th className="px-2 pb-1 text-right font-medium">Samples</th>
            </tr>
          </thead>
          <tbody>
            {LANE_IDS.map((id, i) => {
              const l = byId[id]
              const lamp = powered && l ? lampOf(l.signal) : 'off'
              const rec = waits?.lanes?.[id]
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
                  <td className="num px-2 text-ink-strong">{id}</td>
                  <td className="px-2 text-ink">{APPROACH_NAME[id[0]]}</td>
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
        <span className="text-ink">Now</span> is the live simulation. <span className="text-ink">Mean wait</span> is
        the average across every run recorded in the database.
      </div>
    </Panel>
  )
}
