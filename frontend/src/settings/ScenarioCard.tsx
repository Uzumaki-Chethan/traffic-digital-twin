import { motion, useReducedMotion } from 'framer-motion'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { DEMAND_LABEL, type ScenarioInfo } from '@/data/scenarios'
import { DUR, EASE_OUT, EASE_SPRING, STAGGER, enter } from '@/ui/motion'

/**
 * One scenario, as a card to pick: its name, one line on what happens,
 * and how much traffic it carries. The id never appears — the request
 * carries it, the viewer reads the name.
 *
 * This is the one genuinely card-shaped surface in the product, and the
 * one place a hover lift is honest: these cards exist to be chosen, so
 * the card under the pointer rising 2px and its rule warming is an
 * answer to "can I click this", not decoration. Selection draws an
 * accent bar across the top from the leading edge — a line being drawn,
 * which reads as a decision being recorded.
 */
export function ScenarioCard({
  scenario,
  selected,
  disabled,
  onSelect,
  index = 0,
}: {
  scenario: ScenarioInfo
  selected: boolean
  disabled: boolean
  onSelect: () => void
  /** Place in the grid, so the cards arrive as a staircase rather than
   * a slab. Capped in motion.ts so card thirteen is not left waiting. */
  index?: number
}) {
  const reduced = useReducedMotion()
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduced || disabled ? undefined : { y: -2 }}
      whileTap={reduced || disabled ? undefined : { scale: 0.985, y: 0 }}
      transition={{ ...enter, delay: Math.min(index * STAGGER * 0.45, 0.45) }}
      className={clsx(
        'group relative flex min-h-[96px] flex-col gap-1.5 overflow-hidden rounded-control border-2 px-3 py-2.5 text-left transition-colors',
        selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-rule bg-plate hover:border-[var(--rule-strong)]',
        disabled && 'cursor-not-allowed opacity-60',
      )}
      style={{ boxShadow: selected ? 'var(--shadow-panel)' : undefined }}
    >
      {/* Selection bar, drawn from the leading edge. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] origin-left bg-[var(--accent)] transition-transform duration-200"
        style={{
          transform: `scaleX(${selected ? 1 : 0})`,
          transitionTimingFunction: 'var(--ease-out)',
        }}
      />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[15px] font-medium leading-tight text-ink-strong">{scenario.name}</span>
        {selected ? (
          <motion.span
            initial={reduced ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: DUR.fast, ease: EASE_SPRING }}
            className="mt-0.5 shrink-0"
          >
            <Check size={16} className="text-[var(--accent)]" aria-hidden />
          </motion.span>
        ) : (
          <DemandChip demand={scenario.demand} />
        )}
      </div>
      <span className="text-[12.5px] leading-[1.45] text-ink">{scenario.blurb}</span>
      {selected && (
        <motion.span
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.fast, ease: EASE_OUT }}
          className="mt-auto flex items-center gap-2 pt-1"
        >
          <DemandChip demand={scenario.demand} />
          <span className="eyebrow">selected</span>
        </motion.span>
      )}
    </motion.button>
  )
}

/** Light / Moderate / Heavy / Ramping, coloured like the signal it stresses. */
function DemandChip({ demand }: { demand: ScenarioInfo['demand'] }) {
  const tone = {
    light: 'bg-[var(--plate-ground)] text-ink',
    moderate: 'bg-[#f6dd9a] text-ink-strong',
    heavy: 'bg-[#f0b8b8] text-[var(--signal-red)]',
    ramping: 'bg-[#e6d3b3] text-[var(--signal-amber)]',
  }[demand]
  return (
    <span className={clsx('num shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>
      {DEMAND_LABEL[demand]}
    </span>
  )
}
