import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { Check, ChevronDown, MonitorPlay, Scale } from 'lucide-react'
import type { Target } from '@/data/settings'
import { DUR, EASE_OUT } from '@/ui/motion'

const OPTIONS: { id: Target; label: string; hint: string; icon: typeof MonitorPlay }[] = [
  { id: 'overview', label: 'Overview · demo', hint: 'One controller, Trinetra, watched live', icon: MonitorPlay },
  { id: 'performance', label: 'Performance · Trinetra vs VAC', hint: 'The same scenario twice, side by side, scored', icon: Scale },
]

/**
 * "Choose for": which page the next card click picks a scenario for. A
 * styled listbox in place of the native <select> — a pill that opens a
 * small menu of the two pages, each with a line on what it runs. Keyboard:
 * ↑/↓ to move, Enter/Space to choose, Esc to close; a click outside closes.
 */
export function TargetPicker({ value, onChange }: { value: Target; onChange: (t: Target) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(() => Math.max(0, OPTIONS.findIndex((o) => o.id === value)))
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0]
  const Icon = current.icon

  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

  const choose = (i: number) => {
    onChange(OPTIONS[i].id)
    setOpen(false)
    button.current?.focus()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(Math.max(0, OPTIONS.findIndex((o) => o.id === value)))
        return
      }
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : OPTIONS.length - 1)) % OPTIONS.length)
    }
    if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault()
      choose(active)
    }
  }

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setActive(Math.max(0, OPTIONS.findIndex((o) => o.id === value)))
          setOpen((o) => !o)
        }}
        className={clsx(
          'flex h-10 min-w-[270px] items-center gap-2.5 rounded-full border bg-white pl-3 pr-3.5 text-left text-[13.5px] font-medium text-ink-strong transition-[border-color,box-shadow]',
          open ? 'border-[var(--brand)] shadow-[0_0_0_3px_rgb(255_138_18/0.18)]' : 'border-[rgb(18_30_56/0.14)] hover:border-[var(--brand-edge)]',
        )}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white">
          <Icon size={13} strokeWidth={2.2} aria-hidden />
        </span>
        <span className="flex-1 truncate">{current.label}</span>
        <ChevronDown size={16} aria-hidden className={clsx('shrink-0 text-ink-mute transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Choose for"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: DUR.fast, ease: EASE_OUT }}
            className="absolute left-0 top-full z-30 mt-2 w-[340px] origin-top-left rounded-[16px] border border-[rgb(18_30_56/0.1)] bg-white p-1.5 shadow-[var(--shadow-pop)]"
          >
            {OPTIONS.map((o, i) => {
              const OIcon = o.icon
              const selected = o.id === value
              return (
                <li
                  key={o.id}
                  role="option"
                  aria-selected={selected}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={clsx(
                    'flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors',
                    i === active && 'bg-[rgb(255_138_18/0.09)]',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      selected ? 'bg-[var(--brand)] text-white' : 'bg-[rgb(18_30_56/0.06)] text-ink',
                    )}
                  >
                    <OIcon size={15} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-ink-strong">{o.label}</span>
                    <span className="block text-[12px] text-ink-mute">{o.hint}</span>
                  </span>
                  {selected && <Check size={16} strokeWidth={2.6} aria-hidden className="shrink-0 text-[var(--brand)]" />}
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
