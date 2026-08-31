interface BadgeProps {
  label: string
  color: string
  dim: string
  pulse?: boolean
}

export function Badge({ label, color, dim, pulse }: BadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color, backgroundColor: dim }}
    >
      <span
        className={pulse ? 'h-1.5 w-1.5 rounded-full animate-pulse' : 'h-1.5 w-1.5 rounded-full'}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}
