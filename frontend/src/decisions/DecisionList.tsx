import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import type { DecisionLogRow } from '@/data/api'
import { phaseLabel, modeMeta } from '@/utils/signal'
import { clock } from '@/utils/format'

/** Row height in px — fixed, so the list can be windowed by arithmetic. */
export const ROW_PX = 30
const OVERSCAN = 8

/**
 * Every decision of a run as a dense list: time · phase (a switch shows
 * what it replaced) · how long the phase had been held · the rule ·
 * the reason, cut to one line. Windowed: a run writes a row a second,
 * so ten minutes is 600 rows and an hour 3 600; only the rows in view
 * (plus a few) are in the DOM. Keyboard: ↑/↓ move the selection.
 */
export function DecisionList({
  rows,
  previousPhase,
  selectedId,
  onSelect,
  followLatest,
}: {
  /** Oldest first — possibly a filtered subset, which is why the phase
   * each row replaced comes from the page (computed on the full run). */
  rows: DecisionLogRow[]
  previousPhase: Map<number, string | null>
  selectedId: number | null
  onSelect: (id: number) => void
  /** While a run is live, keep the newest row in view unless the reader scrolled up. */
  followLatest: boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const pinned = useRef(true)

  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Newest at the bottom; stay there while following, unless the reader
  // has scrolled away to read something.
  const count = rows.length
  useEffect(() => {
    const el = scroller.current
    if (!el || count === 0 || !followLatest || !pinned.current) return
    el.scrollTop = el.scrollHeight
  }, [count, followLatest])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    setScrollTop(el.scrollTop)
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < ROW_PX * 2
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const i = rows.findIndex((r) => r.id === selectedId)
    const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)
    if (rows[next]) {
      onSelect(rows[next].id)
      const el = scroller.current
      if (el) {
        const top = next * ROW_PX
        if (top < el.scrollTop) el.scrollTop = top
        else if (top + ROW_PX > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_PX - el.clientHeight
      }
    }
  }

  const first = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN)
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_PX) + OVERSCAN)

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      onKeyDown={onKey}
      tabIndex={0}
      role="listbox"
      aria-label="Decisions"
      className="h-full min-h-0 overflow-y-auto rounded-control bg-inset outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <div style={{ height: rows.length * ROW_PX, position: 'relative' }}>
        {rows.slice(first, last).map((r, k) => {
          const i = first + k
          const prevPhase = previousPhase.get(r.id) ?? null
          const switched = prevPhase !== null && prevPhase !== r.phase
          const mode = modeMeta(r.mode)
          const selected = r.id === selectedId
          return (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(r.id)}
              style={{ position: 'absolute', top: i * ROW_PX, height: ROW_PX }}
              className={clsx(
                'grid w-full grid-cols-[64px_minmax(180px,1.1fr)_52px_112px_2fr] items-center gap-3 border-b border-rule-soft px-3 text-left text-[12px] transition-colors',
                selected ? 'bg-[var(--accent-soft)]' : switched ? 'bg-plate hover:bg-hover' : 'hover:bg-hover',
              )}
            >
              <span className="num text-ink-mute">{clock(r.time)}</span>
              <span className="flex min-w-0 items-center gap-1 text-ink">
                {switched ? (
                  <>
                    <span className="truncate text-ink-mute">{phaseLabel(prevPhase)}</span>
                    <ArrowRight size={11} aria-hidden className="shrink-0 text-ink-mute" />
                    <span className="truncate font-semibold text-ink-strong">{phaseLabel(r.phase)}</span>
                  </>
                ) : (
                  <span className="truncate">{phaseLabel(r.phase)}</span>
                )}
              </span>
              <span className="num text-right text-ink-mute">{r.duration.toFixed(0)} s</span>
              <span
                className={clsx(
                  'w-fit rounded-full border px-2 py-[1px] text-[11px]',
                  mode.loud ? 'border-[var(--signal-red)] text-[var(--signal-red)]' : 'border-rule text-ink',
                )}
              >
                {mode.label}
              </span>
              <span className="truncate text-ink-mute" title={r.reason}>
                {r.reason}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
