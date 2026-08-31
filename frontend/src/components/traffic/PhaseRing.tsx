import type { PhaseName } from '@/types/snapshot'
import { MAX_GREEN_SECONDS, MIN_GREEN_SECONDS } from '@/utils/decisionConstants'
import { modeMeta, phaseLabel } from '@/utils/theme'
import { fmtSeconds } from '@/utils/format'

interface Props {
  phase: PhaseName | string | undefined
  mode: string | undefined
  elapsedSeconds: number | undefined
  isYellow: boolean
}

const R = 46
const CIRC = 2 * Math.PI * R

export function PhaseRing({ phase, mode, elapsedSeconds, isYellow }: Props) {
  const meta = modeMeta(mode)
  const max = phase && phase in MAX_GREEN_SECONDS ? MAX_GREEN_SECONDS[phase as PhaseName] : undefined
  const min = phase && phase in MIN_GREEN_SECONDS ? MIN_GREEN_SECONDS[phase as PhaseName] : undefined
  const elapsed = elapsedSeconds ?? 0
  const fraction = max ? Math.min(1, elapsed / max) : 0
  const dashOffset = CIRC * (1 - fraction)

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx={50} cy={50} r={R} fill="none" stroke="var(--color-border)" strokeWidth={6} />
          <circle
            cx={50}
            cy={50}
            r={R}
            fill="none"
            stroke={isYellow ? 'var(--color-transition)' : meta.color}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.4s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-semibold tabular text-[var(--color-text)]">
            {fmtSeconds(elapsed)}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">
            {isYellow ? 'clearance' : 'in phase'}
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-[var(--color-text)]">{phaseLabel(phase)}</div>
        {min !== undefined && max !== undefined && (
          <div className="text-[11px] text-[var(--color-text-faint)]">
            min {min}s · max {max}s
          </div>
        )}
      </div>
    </div>
  )
}
