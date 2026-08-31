import type { PhaseHistoryEntry } from '@/types/snapshot'
import { phaseLabel } from '@/utils/theme'

const PHASE_COLORS: Record<string, string> = {
  NS_straight_left: 'var(--color-neutral)',
  NS_right: 'var(--color-ai)',
  EW_straight_left: 'var(--color-flow)',
  EW_right: 'var(--color-warn)',
}

export function PhaseTimeline({ history }: { history: PhaseHistoryEntry[] }) {
  if (history.length === 0) {
    return <div className="text-xs text-[var(--color-text-faint)]">No phase history yet.</div>
  }

  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-md border border-[var(--color-border)]">
        {history.map((entry, i) => (
          <div
            key={i}
            title={`T+${entry.time.toFixed(0)}s · ${phaseLabel(entry.phase)}${entry.is_yellow ? ' (clearance)' : ''}`}
            className="h-full flex-1"
            style={{
              backgroundColor: entry.is_yellow ? 'var(--color-transition)' : PHASE_COLORS[entry.phase] ?? 'var(--color-border)',
              opacity: entry.is_yellow ? 0.9 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {Object.entries(PHASE_COLORS).map(([phase, color]) => (
          <div key={phase} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-[11px] text-[var(--color-text-faint)]">{phaseLabel(phase)}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: 'var(--color-transition)' }} />
          <span className="text-[11px] text-[var(--color-text-faint)]">Clearance</span>
        </div>
      </div>
    </div>
  )
}
