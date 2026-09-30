import type { ReactNode } from 'react'
import { CarFront, Clock3, Gauge, OctagonAlert, Shuffle } from 'lucide-react'
import type { MetricsView, PhaseHistoryEntry } from '@/data/types'
import { getSamples, useLiveHistory, type LiveSample } from '@/data/liveHistory'
import { Num } from '@/ui/Num'

/**
 * The five network-wide readings as glass tiles: a glossy round icon, the
 * value, and — from this run's own live history (data/liveHistory) — a
 * small sparkline of the last two minutes and the change against 30 s
 * earlier, coloured by whether that change is good (less waiting is good,
 * more speed is good). All real; nothing here is estimated.
 * (Prediction confidence was removed at the owner's request, and the
 * design's accuracy / throughput / confidence tiles were declined.)
 */
export function MetricsStrip({ metrics, history, powered }: { metrics: MetricsView; history: PhaseHistoryEntry[]; powered: boolean }) {
  useLiveHistory((s) => s.revision)
  let switches = 0
  for (let i = 1; i < history.length; i++) {
    if (!history[i].is_yellow && !history[i - 1].is_yellow && history[i].phase !== history[i - 1].phase) switches++
    else if (history[i].is_yellow && !history[i - 1].is_yellow) switches++
  }
  const span = history.length > 1 ? history[history.length - 1].time - history[0].time : 0
  const samples = powered ? getSamples().slice(-120) : []

  return (
    <div className="grid grid-cols-5 gap-3.5 max-[1280px]:grid-cols-3 max-[860px]:grid-cols-2">
      <Tile
        label="Vehicles in network"
        icon={<CarFront />}
        k1="#56A2FF"
        k2="#1F5FE0"
        n={powered ? metrics.vehicles : null}
        unit="veh"
        series={samples.map((s) => s.vehicles)}
        good="none"
      />
      <Tile
        label="Average wait"
        icon={<Clock3 />}
        k1="#FFC94A"
        k2="#F28A06"
        n={powered ? metrics.avg_wait : null}
        digits={1}
        unit="s"
        sub="simulated"
        series={samples.map((s) => s.wait)}
        good="down"
      />
      <Tile
        label="Average speed"
        icon={<Gauge />}
        k1="#34D399"
        k2="#059669"
        n={powered ? metrics.avg_speed : null}
        digits={1}
        unit="m/s"
        sub={powered ? `${(metrics.avg_speed * 3.6).toFixed(1)} km/h` : undefined}
        series={samples.map((s) => s.speed)}
        good="up"
      />
      <Tile
        label="Queued at red"
        icon={<OctagonAlert />}
        k1="#FB7185"
        k2="#E11D48"
        n={powered ? metrics.stopped : null}
        unit="veh"
        series={samples.map((s) => s.stopped)}
        good="down"
      />
      <Tile
        label="Phase switches"
        icon={<Shuffle />}
        k1="#93C5FD"
        k2="#3B82F6"
        n={powered ? switches : null}
        sub={powered && span > 0 ? `in the last ${Math.round(span)} s` : undefined}
        series={switchSeries(samples)}
        good="none"
      />
    </div>
  )
}

/** Phase changes in the trailing 60 s, at each sample — for the sparkline. */
function switchSeries(samples: LiveSample[]): number[] {
  const out: number[] = []
  const changes: number[] = []
  for (let i = 0; i < samples.length; i++) {
    if (i > 0 && samples[i].phase !== samples[i - 1].phase) changes.push(samples[i].t)
    while (changes.length && samples[i].t - changes[0] > 60) changes.shift()
    out.push(changes.length)
  }
  return out
}

function Tile({
  label,
  icon,
  k1,
  k2,
  n,
  digits = 0,
  unit,
  sub,
  series,
  good,
}: {
  label: string
  icon: ReactNode
  k1: string
  k2: string
  n: number | null
  digits?: number
  unit?: string
  sub?: string
  series: number[]
  /** Which direction of change is an improvement; 'none' shows it neutral. */
  good: 'up' | 'down' | 'none'
}) {
  // Change against the reading 30 samples (≈30 s) ago; hidden when that
  // reading was ~zero, where a percentage means nothing.
  const prev = series.length > 31 ? series[series.length - 31] : null
  const cur = series.length ? series[series.length - 1] : null
  const pct = prev != null && cur != null && Math.abs(prev) >= 0.05 ? ((cur - prev) / prev) * 100 : null
  const tone =
    pct == null || Math.abs(pct) < 0.5 || good === 'none' ? 'flat' : (pct > 0) === (good === 'up') ? 'good' : 'bad'

  return (
    <div className="glass-card relative grid min-h-[92px] grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3 overflow-hidden rounded-[18px] py-3.5 pl-3.5 pr-3">
      <span
        aria-hidden
        className="row-span-2 flex h-12 w-12 items-center justify-center rounded-full text-white [&>svg]:h-[22px] [&>svg]:w-[22px] [&>svg]:stroke-2"
        style={{
          background: `radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.6), rgb(255 255 255 / 0) 44%), linear-gradient(150deg, ${k1}, ${k2})`,
          boxShadow: `0 0 18px 2px color-mix(in srgb, ${k1} 55%, transparent), inset 0 -3px 6px rgb(0 0 0 / 0.18), inset 0 2px 3px rgb(255 255 255 / 0.5), 0 0 0 3px rgb(255 255 255 / 0.9)`,
        }}
      >
        {icon}
      </span>
      <div className="relative z-[1] truncate text-[12.5px] font-medium text-ink">{label}</div>
      <div className="relative z-[1] flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span className="text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink-strong">
          {n == null ? '—' : <Num value={n} digits={digits} />}
        </span>
        {unit && <span className="text-[11.5px] font-medium text-ink-mute">{unit}</span>}
        {pct != null && (
          <span
            className="num text-[11px] font-medium"
            style={{ color: tone === 'good' ? '#067647' : tone === 'bad' ? '#C4252F' : 'var(--ink-mute)' }}
            title="Change against 30 s earlier"
          >
            {pct >= 0 ? '▲' : '▼'}
            {Math.abs(pct).toFixed(0)}%
          </span>
        )}
        {sub && <span className="basis-full truncate pr-[70px] text-[11.5px] text-ink-mute">{sub}</span>}
      </div>
      <Spark series={series} color={k2} />
    </div>
  )
}

function Spark({ series, color }: { series: number[]; color: string }) {
  if (series.length < 3) return null
  const W = 64
  const H = 34
  const lo = Math.min(...series)
  const hi = Math.max(...series)
  const r = hi - lo || 1
  const pts = series.map((v, i) => `${((i / (series.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - lo) / r) * (H - 6)).toFixed(1)}`)
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute bottom-3 right-3 h-[34px] w-16 overflow-visible opacity-90">
      <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={color} opacity={0.12} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
