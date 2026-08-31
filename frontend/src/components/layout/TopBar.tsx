import { Clock } from 'lucide-react'
import { useSimStore } from '@/store/useSimStore'
import { isLive } from '@/types/snapshot'
import { ConnectionPill } from '@/components/common/ConnectionPill'
import { Badge } from '@/components/common/Badge'
import { modeMeta, phaseLabel } from '@/utils/theme'
import { fmtSeconds } from '@/utils/format'

export function TopBar({ pageTitle }: { pageTitle: string }) {
  const latest = useSimStore((s) => s.latest)
  const live = isLive(latest) ? latest : null
  const meta = modeMeta(live?.decision?.mode)

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-6">
      <h1 className="text-base font-semibold text-[var(--color-text)]">{pageTitle}</h1>

      <div className="flex items-center gap-3">
        {live && (
          <>
            <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-panel-raised)] px-3 py-1.5">
              <Clock size={13} className="text-[var(--color-text-faint)]" />
              <span className="font-mono text-xs tabular text-[var(--color-text-dim)]">
                T+{fmtSeconds(live.sim_time)}
              </span>
            </div>
            {live.decision?.active_phase && (
              <span className="hidden items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-panel-raised)] px-3 py-1.5 sm:flex">
                <span className="text-xs text-[var(--color-text-dim)]">{phaseLabel(live.decision.active_phase)}</span>
              </span>
            )}
            <Badge label={meta.label} color={meta.color} dim={meta.dim} pulse={live.decision?.mode === 'emergency'} />
          </>
        )}
        <ConnectionPill />
      </div>
    </header>
  )
}
