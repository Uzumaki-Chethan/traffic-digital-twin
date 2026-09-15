import type { ReactNode } from 'react'
import clsx from 'clsx'

/**
 * The one container: a rounded green card on the amber ground, held by a
 * hairline and a whisper of shadow. The border is load-bearing here —
 * card-against-page separation is only 1.30:1, so the edge does the work
 * that luminance can't.
 */
export function Panel({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title: string
  meta?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={clsx('flex min-h-0 flex-col overflow-hidden rounded-panel border border-rule bg-plate', className)}
      style={{ boxShadow: 'var(--shadow-panel)' }}
    >
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 px-3.5 pt-1">
        <h2 className="panel-title">{title}</h2>
        {meta && <div className="num min-w-0 text-right text-[12px] text-ink-mute">{meta}</div>}
      </header>
      <div className={clsx('min-h-0 flex-1', bodyClassName ?? 'px-3.5 pb-3.5 pt-1')}>{children}</div>
    </section>
  )
}
