import { api, hasModelInfo } from '@/data/api'
import { useAsync } from '@/data/useAnalytics'
import { useLiveHistory } from '@/data/liveHistory'
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
  const pairs = useLiveHistory((s) => s.predPairs)
  // Mount-once: the horizon is a property of the trained model, not of
  // the run, so it is read from the model's own metadata rather than
  // hardcoded here. If the call fails the panel simply omits it.
  const model = useAsync((signal) => api.modelInfo(signal))
  const horizon = hasModelInfo(model.data) ? model.data.prediction_horizon_seconds : null

  const byLane = new Map((prediction?.rows ?? []).map((r) => [r.lane, r]))

  const meta = (
    <span className="flex items-center gap-3">
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
      <div className="grid grid-cols-4 gap-x-3 gap-y-1">
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
