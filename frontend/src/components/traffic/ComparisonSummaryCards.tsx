import type { ComparisonRow } from '@/types/snapshot'
import { fmtSigned } from '@/utils/format'

export function ComparisonSummaryCards({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((row) => {
        const improved = row.improvement >= 0
        const color = improved ? 'var(--color-flow)' : 'var(--color-stop)'
        const dim = improved ? 'var(--color-flow-dim)' : 'var(--color-stop-dim)'
        return (
          <div key={row.key} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">{row.label}</div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-mono text-lg font-semibold tabular text-[var(--color-text)]">
                {row.ai.toFixed(2)}
              </span>
              <span className="text-[11px] text-[var(--color-text-faint)]">vs {row.baseline.toFixed(2)}</span>
            </div>
            <div
              className="mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular"
              style={{ color, backgroundColor: dim }}
            >
              {fmtSigned(row.improvement)}% {improved ? 'IMPROVED' : 'REGRESSED'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
