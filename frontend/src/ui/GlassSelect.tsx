import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { Check, ChevronDown } from 'lucide-react'
import { DUR, EASE_OUT } from '@/ui/motion'

export interface GlassOption<T extends string> {
  value: T
  label: string
  /** A second, quieter line under the label. */
  hint?: string
  icon?: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>
}

/**
 * The product's dropdown, in place of the native <select> (which can't be
 * styled to match): a white pill showing the current choice, opening a
 * small menu of options — each with an optional icon and a hint line, the
 * chosen one ticked. Keyboard: ↑/↓ move (and open), Enter/Space choose,
 * Esc closes; a click outside closes. Long lists scroll inside the menu.
 */
export function GlassSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder = '—',
  disabled,
  minWidth = 270,
  menuWidth = 340,
  size = 'md',
  floating = false,
}: {
  value: T | null
  options: GlassOption<T>[]
  onChange: (v: T) => void
  /** Accessible name for the menu. */
  label: string
  placeholder?: string
  disabled?: boolean
  minWidth?: number
  menuWidth?: number
  /** 'sm': the compact pill for inline control bars (Dispatch, Incident). */
  size?: 'sm' | 'md'
  /** Render the menu on the page's top layer (fixed, portalled), so a card
   * that clips its content can't cut it off; it opens upward when there's
   * no room below. */
  floating?: boolean
}) {
  const sm = size === 'sm'
  const [open, setOpen] = useState(false)
  const indexOf = (v: T | null) => Math.max(0, options.findIndex((o) => o.value === v))
  const [active, setActive] = useState(() => indexOf(value))
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const current = options.find((o) => o.value === value) ?? null
  const Icon = current?.icon

  // where a floating menu sits: under the button, or over it near the bottom
  const [place, setPlace] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    if (!open || !floating) return
    const measure = () => {
      const r = button.current?.getBoundingClientRect()
      if (!r) return
      const h = Math.min(360, options.length * (sm ? 38 : 46) + 14)
      const below = r.bottom + 8 + h <= window.innerHeight
      setPlace(below ? { left: r.left, top: r.bottom + 8 } : { left: r.left, bottom: window.innerHeight - r.top + 8 })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, floating, options.length, sm])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node
      if (!root.current?.contains(t) && !list.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    return () => document.removeEventListener('pointerdown', onDoc)
  }, [open])

  // Keep the keyboard-active option in view in a long list.
  useEffect(() => {
    if (!open) return
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const choose = (i: number) => {
    onChange(options[i].value)
    setOpen(false)
    button.current?.focus()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled || options.length === 0) return
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(indexOf(value))
        return
      }
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
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
        disabled={disabled}
        onClick={() => {
          setActive(indexOf(value))
          setOpen((o) => !o)
        }}
        style={{ minWidth }}
        className={clsx(
          'fx-btn fx-soft flex items-center rounded-full border bg-white/60 text-left font-medium text-ink-strong transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60',
          sm ? 'h-8 gap-1.5 pr-2.5 text-[12.5px]' : 'h-10 gap-2.5 pr-3.5 text-[13.5px]',
          Icon ? 'pl-2' : sm ? 'pl-3' : 'pl-4',
          open ? 'border-[var(--brand)] shadow-[0_0_0_3px_rgb(255_138_18/0.18)]' : 'border-white/60 hover:border-[var(--brand-edge)] hover:bg-white/75',
        )}
      >
        {Icon && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white">
            <Icon size={13} strokeWidth={2.2} aria-hidden />
          </span>
        )}
        <span className="flex-1 truncate">{current?.label ?? placeholder}</span>
        <ChevronDown size={sm ? 14 : 16} aria-hidden className={clsx('shrink-0 text-ink-mute transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {floating && typeof document !== 'undefined' ? createPortal(<AnimatePresence>
        {open && (
          <motion.ul
            ref={list}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: DUR.fast, ease: EASE_OUT }}
            style={{
              ...(floating ? place : {}),
              width: menuWidth,
              // The cards' own glass, slightly denser so the options stay
              // readable over whatever is under the menu; a light blur is
              // affordable here because the menu is only up while open.
              backgroundImage: 'linear-gradient(180deg, rgb(236 242 251 / 0.9), rgb(220 230 244 / 0.86))',
              backdropFilter: 'blur(14px) saturate(140%)',
              WebkitBackdropFilter: 'blur(14px) saturate(140%)',
            }}
            className={clsx(
              'max-h-[360px] origin-top-left overflow-y-auto rounded-[16px] border border-white/60 p-1.5 shadow-[var(--shadow-pop)]',
              floating ? 'fixed z-[300]' : 'absolute left-0 top-full z-30 mt-2',
            )}
          >
            {options.map((o, i) => {
              const OIcon = o.icon
              const selected = o.value === value
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={selected}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={clsx(
                    'flex cursor-pointer items-center gap-3 rounded-[12px] px-3 transition-colors',
                    sm ? 'py-2' : 'py-2.5',
                    i === active && 'bg-[rgb(255_138_18/0.12)]',
                  )}
                >
                  {OIcon && (
                    <span
                      className={clsx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        selected ? 'bg-[var(--brand)] text-white' : 'bg-white/60 text-ink',
                      )}
                    >
                      <OIcon size={15} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block font-medium text-ink-strong', sm ? 'text-[12.5px]' : 'text-[13.5px]')}>{o.label}</span>
                    {o.hint && <span className="block text-[12px] text-ink-mute">{o.hint}</span>}
                  </span>
                  {selected && <Check size={16} strokeWidth={2.6} aria-hidden className="shrink-0 text-[var(--brand)]" />}
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>, document.body) : <AnimatePresence>
        {open && (
          <motion.ul
            ref={list}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: DUR.fast, ease: EASE_OUT }}
            style={{
              ...(floating ? place : {}),
              width: menuWidth,
              // The cards' own glass, slightly denser so the options stay
              // readable over whatever is under the menu; a light blur is
              // affordable here because the menu is only up while open.
              backgroundImage: 'linear-gradient(180deg, rgb(236 242 251 / 0.9), rgb(220 230 244 / 0.86))',
              backdropFilter: 'blur(14px) saturate(140%)',
              WebkitBackdropFilter: 'blur(14px) saturate(140%)',
            }}
            className={clsx(
              'max-h-[360px] origin-top-left overflow-y-auto rounded-[16px] border border-white/60 p-1.5 shadow-[var(--shadow-pop)]',
              floating ? 'fixed z-[300]' : 'absolute left-0 top-full z-30 mt-2',
            )}
          >
            {options.map((o, i) => {
              const OIcon = o.icon
              const selected = o.value === value
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={selected}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={clsx(
                    'flex cursor-pointer items-center gap-3 rounded-[12px] px-3 transition-colors',
                    sm ? 'py-2' : 'py-2.5',
                    i === active && 'bg-[rgb(255_138_18/0.12)]',
                  )}
                >
                  {OIcon && (
                    <span
                      className={clsx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        selected ? 'bg-[var(--brand)] text-white' : 'bg-white/60 text-ink',
                      )}
                    >
                      <OIcon size={15} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block font-medium text-ink-strong', sm ? 'text-[12.5px]' : 'text-[13.5px]')}>{o.label}</span>
                    {o.hint && <span className="block text-[12px] text-ink-mute">{o.hint}</span>}
                  </span>
                  {selected && <Check size={16} strokeWidth={2.6} aria-hidden className="shrink-0 text-[var(--brand)]" />}
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>}
    </div>
  )
}
