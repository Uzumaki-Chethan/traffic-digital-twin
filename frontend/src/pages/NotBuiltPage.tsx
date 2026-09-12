/** Honest placeholder — never an empty chart frame or a fake screen. */
export function NotBuiltPage({ title, iteration }: { title: string; iteration: number }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-sm rounded-panel bg-plate p-5" style={{ boxShadow: 'var(--shadow-panel)' }}>
        <div className="panel-title">{title}</div>
        <p className="mt-2 text-[14px] text-ink">
          This page is scheduled for iteration {iteration}. The Overview is the current gate: once its
          direction is approved, the remaining pages are built on the same tokens and shell.
        </p>
      </div>
    </div>
  )
}
