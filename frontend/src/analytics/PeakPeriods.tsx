import type { PeakPeriod } from '@/data/api'
import { Panel } from '@/ui/Panel'

/**
 * The busiest recorded windows, detected statistically from congestion
 * history rather than assumed from a clock — simulated time has no real
 * hour of day.
 */
export function PeakPeriods({ peaks }: { peaks: PeakPeriod[] }) {
  if (peaks.length === 0) {
    return (
      <Panel title="Peak periods">
        <div className="py-6 text-center text-[13px] text-ink-mute">No recorded history yet.</div>
      </Panel>
    )
  }
  const max = peaks.reduce((m, p) => Math.max(m, p.peak_congestion_score), 0)

  return (
    <Panel title="Peak periods" meta={`top ${peaks.length}`}>
      <div className="flex flex-col gap-1.5">
        {peaks.map((p, i) => (
          <div key={`${p.start_time}-${i}`} className="flex items-center gap-2">
            <span className="num w-[96px] shrink-0 text-[12.5px] text-ink-strong">
              {p.start_time}–{p.end_time}s
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded-[3px] bg-inset">
              <div
                className="h-full rounded-[3px] bg-accent"
                style={{ width: `${max === 0 ? 0 : (p.peak_congestion_score / max) * 100}%`, opacity: 0.85 }}
              />
            </div>
            <span className="num w-[54px] shrink-0 text-right text-[12.5px] text-ink-strong">
              {p.peak_congestion_score.toFixed(3)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-rule-soft pt-2 text-[12px] text-ink-mute">
        Windows are ranked by mean congestion across recorded runs. The backend does not record which
        named scenario produced a run, so peaks are not attributed to one.
      </div>
    </Panel>
  )
}
