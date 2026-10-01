import { useEffect, useRef, useState, type ComponentType } from 'react'
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
}) {
  const [open, setOpen] = useState(false)
  const indexOf = (v: T | null) => Math.max(0, options.findIndex((o) => o.value === v))
  const [active, setActive] = useState(() => indexOf(value))
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const current = options.find((o) => o.value === value) ?? null
  const Icon = current?.icon

  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
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
          'fx-btn fx-soft flex h-10 items-center gap-2.5 rounded-full border bg-white/60 pr-3.5 text-left text-[13.5px] font-medium text-ink-strong transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60',
          Icon ? 'pl-2' : 'pl-4',
          open ? 'border-[var(--brand)] shadow-[0_0_0_3px_rgb(255_138_18/0.18)]' : 'border-white/60 hover:border-[var(--brand-edge)] hover:bg-white/75',
        )}
      >
        {Icon && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white">
            <Icon size={13} strokeWidth={2.2} aria-hidden />
          </span>
        )}
        <span className="flex-1 truncate">{current?.label ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden className={clsx('shrink-0 text-ink-mute transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
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
              width: menuWidth,
              // The cards' own glass, slightly denser so the options stay
              // readable over whatever is under the menu; a light blur is
              // affordable here because the menu is only up while open.
              backgroundImage: 'linear-gradient(180deg, rgb(236 242 251 / 0.9), rgb(220 230 244 / 0.86))',
              backdropFilter: 'blur(14px) saturate(140%)',
              WebkitBackdropFilter: 'blur(14px) saturate(140%)',
            }}
            className="absolute left-0 top-full z-30 mt-2 max-h-[360px] origin-top-left overflow-y-auto rounded-[16px] border border-white/60 p-1.5 shadow-[var(--shadow-pop)]"
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
                    'flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors',
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
                    <span className="block text-[13.5px] font-medium text-ink-strong">{o.label}</span>
                    {o.hint && <span className="block text-[12px] text-ink-mute">{o.hint}</span>}
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
