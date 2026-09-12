import { useMemo } from 'react'
import clsx from 'clsx'
import type { CongestionLaneBucket } from '@/data/api'
import { LANE_IDS } from '@/data/types'
import { useSim } from '@/data/store'
import { Panel } from '@/ui/Panel'
import { movementOf } from '@/utils/signal'

/**
 * Twelve lanes down, time across — each cell is that lane's mean
 * congestion score in that time bucket. Congestion is a magnitude, not a
 * signal state, so it uses the instrument accent on a single sequential
 * ramp with the real numeric range in the legend; signal red/amber/green
 * are never spent on it.
 *
 * The time axis is SIMULATED seconds from the start of a run, and the
 * database accumulates every run that has ever been recorded — so a
 * bucket is the mean across all recorded runs at that offset, not one
 * run. Labelled as such; it is a different time basis from the Overview.
 */
export function LanePressureHeatmap({ buckets }: { buckets: CongestionLaneBucket[] }) {
  const hoverLane = useSim((s) => s.hoverLane)
  const setHoverLane = useSim((s) => s.setHoverLane)

  const { starts, byLane, max, runs } = useMemo(() => {
    const startSet = new Set<number>()
    const map: Record<string, Record<number, number>> = {}
    let hi = 0
    let maxSamples = 0
    for (const b of buckets) {
      startSet.add(b.bucket_start)
      ;(map[b.lane_id] ??= {})[b.bucket_start] = b.avg_congestion_score
      if (b.avg_congestion_score > hi) hi = b.avg_congestion_score
      if (b.sample_count > maxSamples) maxSamples = b.sample_count
    }
    const sorted = [...startSet].toSorted((a, b) => a - b)
    // Each lane contributes ~1 sample per decision tick (~1 s), so samples
    // per 60 s bucket ÷ 60 estimates how many runs are folded together.
    const bucketSpan = sorted.length > 1 ? sorted[1] - sorted[0] : 60
    return { starts: sorted, byLane: map, max: hi, runs: Math.max(1, Math.round(maxSamples / bucketSpan)) }
  }, [buckets])

  if (buckets.length === 0) {
    return (
      <Panel title="Lane pressure over time">
        <div className="py-6 text-center text-[13px] text-ink-mute">
          No recorded lane history yet. Run the simulation once and it will appear here.
        </div>
      </Panel>
    )
  }

  const span = starts.length > 1 ? starts[1] - starts[0] : 60

  return (
    <Panel
      title="Lane pressure over time"
      meta={`${LANE_IDS.length} lanes · ${starts.length} × ${span}s buckets`}
    >
      <div className="mb-2 text-[12px] text-ink-mute">
        Mean congestion score per lane, by simulated time from the start of a run — averaged across
        the {runs} recorded run{runs === 1 ? '' : 's'} in the database, not the live simulation.
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {LANE_IDS.map((id, i) => {
            const row = byLane[id] ?? {}
            const dim = hoverLane !== null && hoverLane !== id
            const newApproach = i > 0 && id[0] !== LANE_IDS[i - 1][0]
            return (
              <div
                key={id}
                onMouseEnter={() => setHoverLane(id)}
                onMouseLeave={() => setHoverLane(null)}
                className={clsx(
                  'flex items-center gap-2 transition-opacity',
                  newApproach && 'mt-1.5 border-t border-rule-soft pt-1.5',
                  dim && 'opacity-45',
                )}
              >
                <span className="num w-[74px] shrink-0 text-[12px] text-ink-strong">{id}</span>
                <span className="w-[62px] shrink-0 text-[12px] text-ink-mute">{movementOf(id)}</span>
                <div className="flex flex-1 gap-[3px]">
                  {starts.map((s) => {
                    const v = row[s]
                    const norm = v === undefined || max === 0 ? null : v / max
                    return (
                      <div
                        key={s}
                        title={
                          v === undefined
                            ? `${id} · ${s}–${s + span}s · no samples`
                            : `${id} · ${s}–${s + span}s · congestion ${v.toFixed(4)}`
                        }
                        className="h-6 flex-1 rounded-[3px] bg-inset"
                      >
                        {norm !== null && (
                          <div
                            className="h-full w-full rounded-[3px] bg-accent"
                            style={{ opacity: 0.1 + 0.9 * norm }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="mt-2 flex items-center gap-2 border-t border-rule-soft pt-2">
            <span className="w-[140px] shrink-0" />
            <div className="flex flex-1 justify-between text-[12px] text-ink-mute">
              {starts.map((s, i) => (
                <span key={s} className="num">
                  {i === starts.length - 1 ? `${s + span}s` : `${s}s`}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-mute">
        <span>Congestion</span>
        <span className="num">0</span>
        <span className="flex h-3 w-28 overflow-hidden rounded-[3px]">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((o) => (
            <span key={o} className="h-full flex-1 bg-accent" style={{ opacity: o }} />
          ))}
        </span>
        <span className="num">{max.toFixed(3)}</span>
        <span>(higher = more pressure on that lane)</span>
      </div>
    </Panel>
  )
}
