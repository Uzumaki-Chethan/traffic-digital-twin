import { api, hasModelInfo } from '@/data/api'
import { useAsync } from '@/data/useAnalytics'
import { getPredictionSeries, useLiveHistory, type PredictionPoint } from '@/data/liveHistory'
import type { PredictionView } from '@/data/types'
import { LANE_IDS } from '@/data/types'
import { Panel } from '@/ui/Panel'
import { APPROACH_NAME, movementOf } from '@/utils/signal'
import { f1 } from '@/utils/format'

/**
 * What the Random Forest said would happen, beside what did.
 *
 * This is the only place the ML layer appears anywhere in the UI, which
 * is why it earns the space under the twin. The backend parks every
 * prediction until its horizon elapses and then pairs it with the actual
 * observed values (see simulation_runner.evaluate_matured_predictions);
 * this draws that pair, per lane, as it matures.
 *
 * NO CONFIDENCE FIGURE. The snapshot carries one and it is deliberately
 * never shown — standing instruction from the user. What a model claims
 * about its own certainty is not evidence; the error column beside it is.
 *
 * The error bar diverges from a centre line: right means the model
 * predicted MORE traffic than arrived, left means less. One colour, so
 * the direction is doing the work and nothing competes with the signal
 * colours the rest of the page reserves.
 */

/** Bar half-width, in vehicles. Errors past this clamp rather than rescale,
 * so the bar means the same thing from one glance to the next. */
const ERROR_SCALE = 6

export function PredictionPanel({ prediction, powered }: { prediction: PredictionView | null; powered: boolean }) {
  const mae = useLiveHistory((s) => s.predMae)
  useLiveHistory((s) => s.revision)
  const series = powered ? getPredictionSeries() : []
  const pairs = useLiveHistory((s) => s.predPairs)
  // Mount-once: the horizon is a property of the trained model, not of
  // the run, so it is read from the model's own metadata rather than
  // hardcoded here. If the call fails the panel simply omits it.
  const model = useAsync((signal) => api.modelInfo(signal))
  const horizon = hasModelInfo(model.data) ? model.data.prediction_horizon_seconds : null

  const byLane = new Map((prediction?.rows ?? []).map((r) => [r.lane, r]))

  const meta = (
    <span className="flex items-center gap-3">
      <Legend />
      {horizon != null && <span>{horizon}s horizon</span>}
      {mae != null && (
        <span>
          MAE <span className="text-ink-strong">{f1(mae)}</span> veh · {pairs.toLocaleString()} pairs
        </span>
      )}
    </span>
  )

  if (!powered || prediction === null || prediction.rows.length === 0) {
    return (
      <Panel title="Prediction vs actual" meta={horizon != null ? `${horizon}s horizon` : undefined}>
        <div className="py-4 text-center text-[13px] leading-[1.5] text-ink-mute">
          {!powered ? (
            <>No simulation running.</>
          ) : (
            <>
              No matured prediction yet. The model forecasts{' '}
              {horizon != null ? `${horizon} seconds` : 'a fixed horizon'} ahead, so the first pair appears
              that far into a run — and this stays empty for the whole run if no trained model was found
              at startup.
            </>
          )}
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="Prediction vs actual" meta={meta}>
      <div className="mb-4 grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2">
        {(['N', 'S', 'E', 'W'] as const).map((a) => (
          <ApproachChart key={a} approach={a} series={series} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-1 max-[1100px]:grid-cols-2">
        {(['N', 'S', 'E', 'W'] as const).map((approach) => (
          <div key={approach} className="min-w-0">
            <div className="mb-0.5 flex items-baseline justify-between border-b border-rule pb-0.5">
              <span className="text-[12px] font-semibold text-ink-strong">{APPROACH_NAME[approach]}</span>
              <span className="text-[11.5px] text-ink-mute">pred → actual</span>
            </div>
            {LANE_IDS.filter((id) => id.startsWith(approach)).map((id) => {
              const row = byLane.get(id)
              const error = row ? row.pred_veh - row.act_veh : null
              return (
                <div key={id} className="flex items-center gap-1.5 border-b border-rule-soft py-[3px] last:border-b-0">
                  <span className="w-[16px] shrink-0 text-[11px] text-ink-mute">{movementOf(id).charAt(0)}</span>
                  <span className="num w-[62px] shrink-0 text-[11.5px] text-ink">
                    {row ? `${f1(row.pred_veh)}→${row.act_veh}` : '—'}
                  </span>
                  <ErrorBar error={error} />
                  <span
                    className={
                      error === null
                        ? 'num w-[34px] shrink-0 text-right text-[11.5px] text-ink-mute'
                        : 'num w-[34px] shrink-0 text-right text-[11.5px] text-ink-strong'
                    }
                  >
                    {error === null ? '—' : `${error >= 0 ? '+' : '−'}${Math.abs(error).toFixed(1)}`}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 border-t border-rule-soft pt-2 text-[12px] text-ink-mute">
        Each row is one lane at{' '}
        <span className="num text-ink">t = {Math.round(prediction.target_time)}s</span> of simulated time:
        what the model predicted, what actually arrived, and the difference. A bar to the right means it
        expected more traffic than turned up.
      </div>
    </Panel>
  )
}

function Legend() {
  return (
    <span className="flex items-center gap-3 font-[family-name:var(--font-ui)] text-[11.5px] text-ink">
      <span className="flex items-center gap-1.5">
        <i className="inline-block h-0 w-4 rounded border-t-[2.5px]" style={{ borderColor: 'var(--predicted)' }} />
        Predicted
      </span>
      <span className="flex items-center gap-1.5">
        <i className="inline-block h-0 w-4 rounded border-t-[2.5px]" style={{ borderColor: 'var(--actual)' }} />
        Actual
      </span>
    </span>
  )
}

/** Window the charts show, simulated seconds back from the newest pair. */
const WINDOW = 60

/**
 * One approach, the last minute: the model's predicted vehicle total (for
 * the time each prediction targeted) against the total that actually
 * arrived. Every point is a matured pair from data/liveHistory — the chart
 * draws nothing the backend did not pair up.
 */
function ApproachChart({ approach, series }: { approach: 'N' | 'S' | 'E' | 'W'; series: readonly PredictionPoint[] }) {
  const end = series.length ? series[series.length - 1].t : 0
  const pts = series.filter((p) => p.t >= end - WINDOW)
  const W = 170
  const H = 96
  const L = 20
  const B = 15
  const hi = Math.max(1, ...pts.map((p) => Math.max(p.pred[approach], p.act[approach])))
  const top = Math.ceil(hi / 2) * 2
  const x = (t: number) => L + ((t - (end - WINDOW)) / WINDOW) * (W - L - 4)
  const y = (v: number) => H - B - (v / top) * (H - B - 6)
  const line = (k: 'pred' | 'act') => pts.map((p) => `${x(p.t).toFixed(1)},${y(p[k][approach]).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <div className="min-w-0 rounded-[14px] border border-white/50 bg-white/55 px-2.5 pb-1.5 pt-2.5 shadow-[0_6px_16px_-12px_rgb(3_8_24/0.45)]">
      <div className="flex items-baseline justify-between px-0.5">
        <span className="text-[13.5px] font-semibold text-ink-strong">{APPROACH_NAME[approach]}</span>
        {last && (
          <span className="num text-[11px] text-ink-mute">
            {f1(last.pred[approach])} → {last.act[approach]}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-[96px] w-full" aria-label={`${APPROACH_NAME[approach]}: predicted against actual vehicles, last ${WINDOW} s`}>
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - 4} y1={y(v)} y2={y(v)} stroke="rgb(18 30 56 / 0.08)" />
            <text x={L - 4} y={y(v) + 3} textAnchor="end" className="fill-ink-mute" fontSize="9.5" fontFamily="var(--font-num)">
              {v}
            </text>
          </g>
        ))}
        {[-60, -45, -30, -15, 0].map((d) => (
          <text key={d} x={x(end + d)} y={H - 3} textAnchor={d === 0 ? 'end' : d === -60 ? 'start' : 'middle'} className="fill-ink-mute" fontSize="9.5" fontFamily="var(--font-num)">
            {d === 0 ? 'now' : d}
          </text>
        ))}
        {pts.length > 1 ? (
          <>
            <polyline points={line('act')} fill="none" stroke="var(--actual)" strokeWidth="1.8" strokeLinejoin="round" />
            <polyline points={line('pred')} fill="none" stroke="var(--predicted)" strokeWidth="1.8" strokeLinejoin="round" />
          </>
        ) : (
          <text x={(W + L) / 2} y={H / 2} textAnchor="middle" className="fill-ink-mute" fontSize="10">
            gathering pairs…
          </text>
        )}
      </svg>
    </div>
  )
}

function ErrorBar({ error }: { error: number | null }) {
  if (error === null) return <span className="h-2 flex-1" />
  const fraction = Math.min(1, Math.abs(error) / ERROR_SCALE)
  const over = error >= 0
  return (
    <span className="relative h-2.5 flex-1 overflow-hidden rounded-[2px] bg-inset" aria-hidden>
      <span className="absolute inset-y-0 left-1/2 w-px bg-rule-strong" />
      <span
        className="absolute inset-y-[2px] rounded-[1px] bg-accent"
        style={{
          left: over ? '50%' : `${50 - fraction * 50}%`,
          width: `${fraction * 50}%`,
          transition: 'left var(--dur-value) var(--ease-out), width var(--dur-value) var(--ease-out)',
        }}
      />
    </span>
  )
}
