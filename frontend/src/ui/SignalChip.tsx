import type { LampState } from '@/utils/signal'
import { lampLabel } from '@/utils/signal'

/**
 * A signal state as a small white pill: a lit dot in the real signal
 * colour AND the state spelled out, so it never depends on hue alone.
 * Same vocabulary as the Overview's Lanes table.
 */
const DOT: Record<LampState, string> = {
  green: 'var(--dot-green)',
  amber: 'var(--dot-amber)',
  red: 'var(--dot-red)',
  off: '#C9D1DE',
}

export function SignalChip({ lamp }: { lamp: LampState }) {
  const off = lamp === 'off'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(18_30_56/0.1)] bg-white/80 py-0.5 pl-1.5 pr-2.5 text-[12px] font-medium text-ink">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: DOT[lamp], boxShadow: off ? undefined : `0 0 6px ${DOT[lamp]}` }}
      />
      {lampLabel(lamp)}
    </span>
  )
}
