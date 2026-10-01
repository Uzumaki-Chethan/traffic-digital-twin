import { motion, useReducedMotion } from 'framer-motion'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { DEMAND_LABEL, type ScenarioInfo } from '@/data/scenarios'
import { DUR, EASE_OUT, EASE_SPRING, STAGGER, enter } from '@/ui/motion'
import { ScenarioPreview } from './ScenarioPreview'

/** A page a scenario can be chosen for. */
export type ScenarioUse = 'overview' | 'performance'

const USE_LABEL: Record<ScenarioUse, string> = {
  overview: 'Overview',
  performance: 'Performance',
}

/**
 * One scenario, as a card to pick: its name, one line on what happens,
 * and how much traffic it carries. The id never appears — the request
 * carries it, the viewer reads the name. Its footer names the page(s)
 * currently set to run it, so both choices read from one grid.
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
  usedBy = [],
}: {
  scenario: ScenarioInfo
  /** Chosen for the page the dropdown currently names. */
  selected: boolean
  disabled: boolean
  onSelect: () => void
  /** Every page currently set to run this scenario. */
  usedBy?: ScenarioUse[]
  /** Place in the grid, so the cards arrive as a staircase rather than
   * a slab. Capped in motion.ts so card thirteen is not left waiting. */
  index?: number
}) {
  const reduced = useReducedMotion()
  // The prototype's card feel: the card tilts toward the pointer (up to
  // ~4.5° / 3.5°), lifts 4 px, and a soft glare follows the pointer across
  // it. CSS variables written on pointer move; the transform lives on the
  // button, the entrance on the wrapper, so framer and the tilt never
  // fight over the same transform.
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (reduced || disabled) return
    const el = e.currentTarget
    const b = el.getBoundingClientRect()
    const u = (e.clientX - b.left) / b.width
    const v = (e.clientY - b.top) / b.height
    el.style.setProperty('--gx', `${u * 100}%`)
    el.style.setProperty('--gy', `${v * 100}%`)
    el.style.setProperty('--ry', `${((u - 0.5) * 9).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${((0.5 - v) * 7).toFixed(2)}deg`)
  }
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...enter, delay: Math.min(index * STAGGER * 0.45, 0.45) }}
      className="flex"
    >
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={clsx(
        'scenario-card glass-card group relative flex w-full flex-col text-left',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      {/* The signal ring: red, orange, green in equal thirds round the
          border — always on for the selected card, and on hover it spins
          one full turn and stops (index.css .scenario-ring). It replaces the
          old orange border, which clashed with the page-arrival light. */}
      <span aria-hidden className="scenario-ring" />
      {/* Content clips to the rounded corners here, so the ring and the
          arrival light can sit outside the card's edge. */}
      <span className="flex flex-1 flex-col overflow-hidden rounded-[inherit]">
      <ScenarioPreview id={scenario.id} seed={index} />
      <span className="flex flex-1 flex-col gap-1.5 px-3.5 pb-3 pt-2.5">
      <span className="flex items-start justify-between gap-2">
        <span className="text-[15px] font-medium leading-tight text-ink-strong">{scenario.name}</span>
        {selected ? (
          <motion.span
            initial={reduced ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: DUR.fast, ease: EASE_SPRING }}
            className="mt-0.5 shrink-0"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)]">
              <Check size={13} strokeWidth={3} className="text-white" aria-hidden />
            </span>
          </motion.span>
        ) : (
          <DemandChip demand={scenario.demand} />
        )}
      </span>
      <span className="text-[12.5px] leading-[1.45] text-ink">{scenario.blurb}</span>
      {(selected || usedBy.length > 0) && (
        <motion.span
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.fast, ease: EASE_OUT }}
          className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1"
        >
          {selected && <DemandChip demand={scenario.demand} />}
          {usedBy.map((use) => (
            <span key={use} className="eyebrow flex items-center gap-1">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
              {USE_LABEL[use]}
            </span>
          ))}
        </motion.span>
      )}
      </span>
      </span>
      {/* the glare that follows the pointer */}
      <span aria-hidden className="scenario-glare pointer-events-none absolute inset-0 z-[2] rounded-[inherit]" />
    </button>
    </motion.div>
  )
}

/** Pointer left: the card eases back flat. */
function onLeave(e: React.PointerEvent<HTMLButtonElement>) {
  const el = e.currentTarget
  el.style.removeProperty('--rx')
  el.style.removeProperty('--ry')
}

/** Light / Moderate / Heavy / Ramping, coloured like the signal it stresses. */
function DemandChip({ demand }: { demand: ScenarioInfo['demand'] }) {
  const tone = {
    light: 'bg-[#dcf5e8] text-[#065f3a]',
    moderate: 'bg-[#fdf0c7] text-[#7a4b00]',
    heavy: 'bg-[#fde0e0] text-[#a3161f]',
    ramping: 'bg-[#e3ecff] text-[#1d4ed8]',
  }[demand]
  return (
    <span className={clsx('num shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>
      {DEMAND_LABEL[demand]}
    </span>
  )
}
