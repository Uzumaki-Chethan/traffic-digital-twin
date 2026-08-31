import type { PredictionView } from '@/types/snapshot'
import { fmt0, fmt1, fmtLaneMovement, fmtApproach } from '@/utils/format'
import { approachOf } from '@/types/snapshot'

function confidenceColor(pct: number): string {
  if (pct >= 70) return 'var(--color-flow)'
  if (pct >= 40) return 'var(--color-transition)'
  return 'var(--color-stop)'
}

export function PredictionPanel({ prediction }: { prediction: PredictionView | null }) {
  if (!prediction) {
    return (
      <div className="text-xs text-[var(--color-text-faint)]">
        No prediction has matured yet (15s horizon) - or no trained model is loaded.
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">
          Matured at T+{prediction.target_time.toFixed(0)}s · 15s horizon
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-faint)]">Avg confidence</span>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular"
            style={{
              color: confidenceColor(prediction.avg_confidence),
              backgroundColor: 'var(--color-panel-inset)',
            }}
          >
            {fmt0(prediction.avg_confidence)}%
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">
              <th className="pb-1.5 pr-3 font-medium">Lane</th>
              <th className="pb-1.5 pr-3 font-medium">Pred. veh</th>
              <th className="pb-1.5 pr-3 font-medium">Actual veh</th>
              <th className="pb-1.5 pr-3 font-medium">Pred. wait</th>
              <th className="pb-1.5 pr-3 font-medium">Actual wait</th>
              <th className="pb-1.5 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular">
            {prediction.rows.map((row) => (
              <tr key={row.lane} className="border-t border-[var(--color-border-soft)]">
                <td className="py-1.5 pr-3 font-sans text-[var(--color-text-dim)]">
                  {fmtApproach(approachOf(row.lane))} · {fmtLaneMovement(row.lane)}
                </td>
                <td className="py-1.5 pr-3 text-[var(--color-text)]">{fmt1(row.pred_veh)}</td>
                <td className="py-1.5 pr-3 text-[var(--color-text)]">{fmt0(row.act_veh)}</td>
                <td className="py-1.5 pr-3 text-[var(--color-text)]">{fmt1(row.pred_wait)}s</td>
                <td className="py-1.5 pr-3 text-[var(--color-text)]">{fmt1(row.act_wait)}s</td>
                <td className="py-1.5" style={{ color: confidenceColor(row.confidence) }}>
                  {fmt0(row.confidence)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
