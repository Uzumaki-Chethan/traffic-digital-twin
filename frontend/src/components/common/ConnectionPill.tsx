import { useSimStore } from '@/store/useSimStore'

const META: Record<string, { label: string; color: string }> = {
  connecting: { label: 'Connecting', color: 'var(--color-transition)' },
  open: { label: 'Live', color: 'var(--color-flow)' },
  closed: { label: 'Disconnected', color: 'var(--color-stop)' },
  error: { label: 'Connection error', color: 'var(--color-stop)' },
}

export function ConnectionPill() {
  const status = useSimStore((s) => s.status)
  const meta = META[status]
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-panel-raised)] px-3 py-1.5">
      <span
        className={status === 'open' ? 'h-2 w-2 rounded-full animate-pulse' : 'h-2 w-2 rounded-full'}
        style={{ backgroundColor: meta.color }}
      />
      <span className="text-xs font-medium text-[var(--color-text-dim)]">{meta.label}</span>
    </div>
  )
}
