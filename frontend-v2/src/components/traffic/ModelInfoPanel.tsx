import { useEffect, useState } from 'react'
import { Panel } from '@/components/common/Panel'
import { api } from '@/services/api'
import type { ModelInfo } from '@/types/logs'
import { fmt1, fmt0 } from '@/utils/format'

function isPopulated(info: ModelInfo | Record<string, never>): info is ModelInfo {
  return 'model_type' in info
}

/**
 * Static training-time credibility panel - test MAE, held-out (unseen
 * scenario) MAE, and dataset size, straight from the metadata file
 * ml/training/train.py writes alongside the model. Useful for a viva:
 * "how do you know the model actually generalizes?" -> held-out MAE on
 * a scenario it never trained on.
 */
export function ModelInfoPanel() {
  const [info, setInfo] = useState<ModelInfo | Record<string, never> | null>(null)

  useEffect(() => {
    api.modelInfo().then(setInfo).catch(() => setInfo({}))
  }, [])

  if (info === null) return null
  if (!isPopulated(info)) {
    return (
      <Panel title="Prediction Model" eyebrow="Random Forest">
        <div className="text-xs text-[var(--color-text-faint)]">No trained model metadata found.</div>
      </Panel>
    )
  }

  return (
    <Panel title="Prediction Model" eyebrow={`${info.model_type} · ${info.n_estimators} trees · ${info.prediction_horizon_seconds}s horizon`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Test MAE" value={fmt1(info.test_metrics.overall_mae)} sub="seen scenarios" />
        <Metric
          label="Held-out MAE"
          value={fmt1(info.held_out_metrics.overall_mae)}
          sub={`unseen: ${info.held_out_scenario}`}
          accent="var(--color-ai)"
        />
        <Metric label="Training rows" value={fmt0(info.training_row_count)} sub={`+ ${fmt0(info.test_row_count)} test`} />
        <Metric label="Scenarios" value={fmt0(info.scenarios_used.length)} sub="trained on, plus 1 held out" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {info.scenarios_used.map((s) => (
          <span
            key={s}
            className="rounded-full bg-[var(--color-panel-inset)] px-2 py-0.5 text-[10px] text-[var(--color-text-faint)]"
          >
            {s}
          </span>
        ))}
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ color: 'var(--color-ai)', backgroundColor: 'var(--color-ai-dim)' }}
        >
          {info.held_out_scenario} (held out)
        </span>
      </div>
    </Panel>
  )
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">{label}</div>
      <div className="font-mono text-lg font-semibold tabular" style={{ color: accent ?? 'var(--color-text)' }}>
        {value}
      </div>
      <div className="text-[10px] text-[var(--color-text-faint)]">{sub}</div>
    </div>
  )
}
