import { Siren } from 'lucide-react'
import { fmtApproach } from '@/utils/format'
import { approachOf } from '@/types/snapshot'

export function EmergencyBanner({ lanes }: { lanes: string[] }) {
  if (lanes.length === 0) return null

  const approaches = [...new Set(lanes.map(approachOf))].map(fmtApproach)

  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-4 py-3 animate-pulse"
      style={{ borderColor: 'var(--color-stop)', backgroundColor: 'var(--color-stop-dim)' }}
    >
      <Siren size={18} className="text-[var(--color-stop)]" />
      <div>
        <div className="text-sm font-semibold text-[var(--color-stop)]">Emergency vehicle detected</div>
        <div className="text-xs text-[var(--color-text-dim)]">
          Approaching from {approaches.join(', ')} - Decision Engine is prioritizing clearance.
        </div>
      </div>
    </div>
  )
}
