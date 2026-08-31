import type { DecisionView } from '@/types/snapshot'
import { Badge } from '@/components/common/Badge'
import { modeMeta, phaseLabel } from '@/utils/theme'
import { fmt1 } from '@/utils/format'

export function DecisionPanel({ decision }: { decision: DecisionView }) {
  const meta = modeMeta(decision.mode)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">Active phase</div>
          <div className="text-sm font-medium text-[var(--color-text)]">{phaseLabel(decision.active_phase)}</div>
        </div>
        <Badge label={meta.label} color={meta.color} dim={meta.dim} pulse={decision.mode === 'emergency'} />
      </div>

      {decision.switched && (
        <div className="rounded-md border border-[var(--color-border-soft)] bg-[var(--color-panel-inset)] px-3 py-1.5 text-[11px] text-[var(--color-text-dim)]">
          Signal just switched into this phase.
        </div>
      )}

      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">Reasoning</div>
        <p className="rounded-md border border-[var(--color-border-soft)] bg-[var(--color-panel-inset)] p-3 text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
          {decision.reason || 'Awaiting first decision tick.'}
        </p>
      </div>

      {decision.phase_scores && (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">
            Priority scores by phase
          </div>
          <div className="space-y-1.5">
            {Object.entries(decision.phase_scores).map(([phase, score]) => {
              const isActive = phase === decision.active_phase
              const pct = Math.min(100, score * 100)
              return (
                <div key={phase} className="flex items-center gap-2">
                  <span
                    className="w-32 shrink-0 truncate text-[11px]"
                    style={{ color: isActive ? 'var(--color-text)' : 'var(--color-text-faint)' }}
                  >
                    {phaseLabel(phase)}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-panel-raised)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: isActive ? meta.color : 'var(--color-text-faint)' }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular text-[var(--color-text-dim)]">
                    {fmt1(score)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
