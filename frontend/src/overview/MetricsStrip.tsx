import type { MetricsView, PhaseHistoryEntry } from '@/data/types'
import { Num } from '@/ui/Num'

/**
 * A low band, not big cards. Four network-wide readings from `metrics`
 * plus the controller's switch rate, derived from phase_history — all
 * real. (Prediction confidence was removed at the user's request.)
 */
export function MetricsStrip({ metrics, history, powered }: { metrics: MetricsView; history: PhaseHistoryEntry[]; powered: boolean }) {
  let switches = 0
  for (let i = 1; i < history.length; i++) {
    if (!history[i].is_yellow && !history[i - 1].is_yellow && history[i].phase !== history[i - 1].phase) switches++
    else if (history[i].is_yellow && !history[i - 1].is_yellow) switches++
  }
  const span = history.length > 1 ? history[history.length - 1].time - history[0].time : 0

  return (
    <div className="grid grid-cols-5 overflow-hidden rounded-panel border border-rule bg-plate" style={{ boxShadow: 'var(--shadow-panel)' }}>
      <Tile label="Vehicles in network" n={powered ? metrics.vehicles : null} unit="veh" />
      <Tile label="Average wait" n={powered ? metrics.avg_wait : null} digits={1} unit="s" sub="simulated" />
      <Tile
        label="Average speed"
        n={powered ? metrics.avg_speed : null}
        digits={1}
        unit="m/s"
        sub={powered ? `${(metrics.avg_speed * 3.6).toFixed(1)} km/h` : undefined}
      />
      <Tile label="Queued at red" n={powered ? metrics.stopped : null} unit="veh" />
      <Tile label="Phase switches" n={powered ? switches : null} sub={powered && span > 0 ? `in the last ${Math.round(span)} s` : undefined} />
    </div>
  )
}

function Tile({
  label,
  n,
  digits = 0,
  unit,
  sub,
}: {
  label: string
  n: number | null
  digits?: number
  unit?: string
  sub?: string
}) {
  return (
    <div className="border-r border-rule-soft px-4 py-3 last:border-r-0">
      <div className="text-[12px] font-medium text-ink-mute">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="num text-[28px] font-semibold leading-none tracking-[-0.015em] text-ink-strong">
          {n == null ? '—' : <Num value={n} digits={digits} />}
        </span>
        {unit && <span className="text-[12.5px] text-ink-mute">{unit}</span>}
        {sub && <span className="num ml-1 text-[12px] text-ink-mute">{sub}</span>}
      </div>
    </div>
  )
}
