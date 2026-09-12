import { useMemo } from 'react'
import type { CongestionBucket } from '@/data/api'
import { Panel } from '@/ui/Panel'

/**
 * Network congestion by simulated-time bucket, drawn as a column plot
 * against one shared scale. Hand-rolled SVG — no chart library for
 * eleven columns.
 */
export function CongestionTrend({ buckets }: { buckets: CongestionBucket[] }) {
  const max = useMemo(() => buckets.reduce((m, b) => Math.max(m, b.avg_congestion_score), 0), [buckets])

  if (buckets.length === 0) {
    return (
      <Panel title="Congestion trend">
        <div className="py-6 text-center text-[13px] text-ink-mute">No recorded history yet.</div>
      </Panel>
    )
  }

  const span = buckets.length > 1 ? buckets[1].bucket_start - buckets[0].bucket_start : 60

  return (
    <Panel title="Congestion trend" meta={`${span}s buckets`}>
      <div className="flex h-[124px] items-end gap-[3px]">
        {buckets.map((b) => {
          const h = max === 0 ? 0 : (b.avg_congestion_score / max) * 100
          return (
            <div
              key={b.bucket_start}
              className="group flex h-full flex-1 flex-col justify-end"
              title={`${b.bucket_start}–${b.bucket_end}s · congestion ${b.avg_congestion_score.toFixed(4)} · ${b.sample_count.toLocaleString()} samples`}
            >
              <div
                className="w-full rounded-t-[3px] bg-accent transition-[height]"
                style={{ height: `${Math.max(2, h)}%`, opacity: 0.85 }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between border-t border-rule-soft pt-1.5 text-[12px] text-ink-mute">
        <span className="num">{buckets[0].bucket_start}s</span>
        <span>
          peak <span className="num text-ink-strong">{max.toFixed(3)}</span>
        </span>
        <span className="num">{buckets[buckets.length - 1].bucket_end}s</span>
      </div>
    </Panel>
  )
}
