import { useId, type ReactNode } from 'react'
import clsx from 'clsx'
import { lampFor, useBeat } from './lampClock'

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

/** A decorative signal head: a random lamp, re-drawn every 30 s (ui/lampClock). */
export function RandomGlyph({ className }: { className?: string }) {
  const key = useId()
  const beat = useBeat()
  return <Glyph s={lampFor(key, beat)} className={className} />
}

/**
 * The one container: a pale glass card over the frosted page, titled in
 * Poppins and led by a signal-head glyph. `glyph` is the panel's own lamp —
 * where a panel has a live signal state (the twin, the active phase) the
 * page passes that state in; elsewhere it's left out, and the head shows
 * a random lamp that changes every 30 s (owner, Section 51).
 */
export function Panel({
  title,
  meta,
  children,
  className,
  bodyClassName,
  glyph,
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
    // The card itself doesn't clip (its border light sits outside the
    // edge); the inner layer clips the content to the rounded corners.
    <section className={clsx('glass-card flex min-h-0 flex-col', className)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
      <header className="flex min-h-[54px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-[18px] py-2">
        <h2 className="panel-title">
          {glyph ? <Glyph s={glyph} /> : <RandomGlyph />}
          {title}
          {titleExtra}
        </h2>
        {/* When title and meta don't both fit, the meta drops to its own line
            rather than squeezing the title into two. */}
        {meta && <div className="num ml-auto min-w-0 text-right text-[12px] text-ink-mute">{meta}</div>}
      </header>
      <div className={clsx('min-h-0 flex-1', bodyClassName ?? 'px-[18px] pb-[18px]')}>{children}</div>
      </div>
    </section>
  )
}
