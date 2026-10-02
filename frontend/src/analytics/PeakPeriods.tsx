import type { Peak } from './series'
import { Panel } from '@/ui/Panel'
import { GrowBar } from '@/ui/Reveal'

/**
 * The busiest recorded windows, detected statistically from congestion
 * history rather than assumed from a clock — simulated time has no real
 * hour of day.
 */
export function PeakPeriods({ peaks }: { peaks: Peak[] }) {
  if (peaks.length === 0) {
    return (
      <Panel title="Peak periods">
        <div className="py-6 text-center text-[13px] text-ink-mute">Waiting for the first tick.</div>
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
              <GrowBar
                fraction={max === 0 ? 0 : p.peak_congestion_score / max}
                delay={0.3 + i * 0.05}
                className="h-full rounded-[3px] bg-accent"
                style={{ opacity: 0.85 }}
              />
            </div>
            <span className="num w-[54px] shrink-0 text-right text-[12.5px] text-ink-strong">
              {p.peak_congestion_score.toFixed(3)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-rule-soft pt-2 text-[12px] text-ink-mute">
        Detected statistically, by ranking this run&rsquo;s own time windows on mean congestion — not
        assumed from a clock, because simulated time has no hour of day.
      </div>
    </Panel>
  )
}
