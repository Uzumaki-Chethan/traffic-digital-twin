import { useMemo } from 'react'
import type { NetworkSample } from './series'
import { Panel } from '@/ui/Panel'
import { f1 } from '@/utils/format'

const W = 320
const H = 200
const PAD_L = 34
const PAD_R = 8
const PAD_T = 8
const PAD_B = 26

/**
 * Every tick of this run as one mark: network speed against network
 * waiting time. A scatter rather than another time series, because the
 * question here is the relationship between the two — not when each
 * happened — and the shape of the cloud answers it directly.
 */
export function SpeedWaitScatter({ rows }: { rows: NetworkSample[] }) {
  const { pts, maxSpeed, maxWait, corr } = useMemo(() => {
    const p = rows.map((r) => ({ x: r.avg_speed, y: r.avg_wait }))
    const ms = Math.max(1e-6, ...p.map((d) => d.x))
    const mw = Math.max(1e-6, ...p.map((d) => d.y))
    let c: number | null = null
    if (p.length > 2) {
      const n = p.length
      const mx = p.reduce((a, d) => a + d.x, 0) / n
      const my = p.reduce((a, d) => a + d.y, 0) / n
      let sxy = 0, sxx = 0, syy = 0
      for (const d of p) {
        sxy += (d.x - mx) * (d.y - my)
        sxx += (d.x - mx) ** 2
        syy += (d.y - my) ** 2
      }
      const den = Math.sqrt(sxx * syy)
      if (den > 0) c = sxy / den
    }
    return { pts: p, maxSpeed: ms, maxWait: mw, corr: c }
  }, [rows])

  if (pts.length === 0) {
    return (
      <Panel title="Speed against waiting time">
        <div className="py-6 text-center text-[13px] text-ink-mute">Waiting for the first tick.</div>
      </Panel>
    )
  }

  const sx = (v: number) => PAD_L + (v / maxSpeed) * (W - PAD_L - PAD_R)
  const sy = (v: number) => H - PAD_B - (v / maxWait) * (H - PAD_T - PAD_B)

  return (
    <Panel title="Speed against waiting time" meta={`${pts.length.toLocaleString()} ticks`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Network average speed plotted against average waiting time">
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="var(--rule)" strokeWidth="1" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--rule)" strokeWidth="1" />
        {pts.map((d, i) => (
          <circle key={i} cx={sx(d.x)} cy={sy(d.y)} r="2" fill="var(--accent)" opacity="0.5" />
        ))}
        <text x={PAD_L - 4} y={PAD_T + 8} textAnchor="end" fontSize="11" fontFamily="var(--font-num)" fill="var(--ink-mute)">
          {f1(maxWait)}
        </text>
        <text x={PAD_L - 4} y={H - PAD_B} textAnchor="end" fontSize="11" fontFamily="var(--font-num)" fill="var(--ink-mute)">
          0
        </text>
        <text x={PAD_L} y={H - PAD_B + 13} fontSize="11" fontFamily="var(--font-num)" fill="var(--ink-mute)">
          0
        </text>
        <text x={W - PAD_R} y={H - PAD_B + 13} textAnchor="end" fontSize="11" fontFamily="var(--font-num)" fill="var(--ink-mute)">
          {f1(maxSpeed)} m/s
        </text>
        <text x={(W + PAD_L) / 2} y={H - 2} textAnchor="middle" fontSize="11" fill="var(--ink-mute)">
          average speed →
        </text>
      </svg>
      <div className="mt-1 border-t border-rule-soft pt-2 text-[12px] text-ink-mute">
        Vertical axis is average waiting time (s).
        {corr !== null && (
          <>
            {' '}
            Correlation <span className="num text-ink-strong">{corr.toFixed(2)}</span> — {describe(corr)}
          </>
        )}
      </div>
    </Panel>
  )
}

function describe(c: number): string {
  const a = Math.abs(c)
  const strength = a > 0.7 ? 'strong' : a > 0.4 ? 'moderate' : a > 0.2 ? 'weak' : 'little to no'
  if (a <= 0.2) return `${strength} linear relationship`
  return `${strength} ${c < 0 ? 'inverse' : 'positive'} relationship`
}
