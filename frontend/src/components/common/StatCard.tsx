import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  unit?: string
  icon: LucideIcon
  accent?: string
  sub?: string
}

export function StatCard({ label, value, unit, icon: Icon, accent = 'var(--color-neutral)', sub }: StatCardProps) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-faint)]">
          {label}
        </span>
        <Icon size={16} style={{ color: accent }} strokeWidth={2} />
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-mono text-2xl font-semibold tabular text-[var(--color-text)]">{value}</span>
        {unit && <span className="text-xs text-[var(--color-text-dim)]">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[11px] text-[var(--color-text-faint)]">{sub}</div>}
    </div>
  )
}
