import type { ReactNode } from 'react'
import clsx from 'clsx'

interface PanelProps {
  title?: string
  eyebrow?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  noPad?: boolean
}

export function Panel({ title, eyebrow, action, children, className, noPad }: PanelProps) {
  return (
    <section
      className={clsx(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]',
        'shadow-[0_1px_0_0_rgba(255,255,255,0.02)_inset]',
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-4 py-3">
          <div>
            {eyebrow && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
                {eyebrow}
              </div>
            )}
            {title && <h2 className="text-sm font-medium text-[var(--color-text)]">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className={noPad ? '' : 'p-4'}>{children}</div>
    </section>
  )
}
