import type { ReactNode } from 'react'
import clsx from 'clsx'

export type GlyphState = 'red' | 'amber' | 'green' | 'off'

/** A small signal head: three lamps, one lit. */
export function Glyph({ s = 'green', className }: { s?: GlyphState; className?: string }) {
  return (
    <span aria-hidden className={clsx('glyph', className)} data-s={s}>
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * The one container: a pale glass card over the frosted page, titled in
 * Poppins and led by a signal-head glyph. `glyph` is the panel's own lamp —
 * where a panel has a live signal state (the twin, the active phase) the
 * page passes that state in; elsewhere it's the panel's fixed colour.
 */
export function Panel({
  title,
  meta,
  children,
  className,
  bodyClassName,
  glyph = 'green',
  titleExtra,
}: {
  title: string
  meta?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  glyph?: GlyphState
  /** Inline with the title, e.g. the twin's "Live simulation" badge. */
  titleExtra?: ReactNode
}) {
  return (
    <section className={clsx('glass-card flex min-h-0 flex-col overflow-hidden', className)}>
      <header className="flex h-[54px] shrink-0 items-center justify-between gap-3 px-[18px]">
        <h2 className="panel-title">
          <Glyph s={glyph} />
          {title}
          {titleExtra}
        </h2>
        {meta && <div className="num min-w-0 text-right text-[12px] text-ink-mute">{meta}</div>}
      </header>
      <div className={clsx('min-h-0 flex-1', bodyClassName ?? 'px-[18px] pb-[18px]')}>{children}</div>
    </section>
  )
}
