import clsx from 'clsx'
import { Check } from 'lucide-react'
import { DEMAND_LABEL, type ScenarioInfo } from '@/data/scenarios'

/**
 * One scenario, as a card to pick: its name, one line on what happens,
 * and how much traffic it carries. The id never appears — the request
 * carries it, the viewer reads the name.
 */
export function ScenarioCard({
  scenario,
  selected,
  disabled,
  onSelect,
}: {
  scenario: ScenarioInfo
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={clsx(
        'group flex min-h-[96px] flex-col gap-1.5 rounded-control border-2 px-3 py-2.5 text-left transition-colors',
        selected ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-rule bg-plate hover:border-[var(--rule-strong)]',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[15px] font-medium leading-tight text-ink-strong">{scenario.name}</span>
        {selected ? (
          <Check size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
        ) : (
          <DemandChip demand={scenario.demand} />
        )}
      </div>
      <span className="text-[12.5px] leading-[1.45] text-ink">{scenario.blurb}</span>
      {selected && (
        <span className="mt-auto flex items-center gap-2 pt-1">
          <DemandChip demand={scenario.demand} />
          <span className="num text-[11px] text-ink-mute">selected</span>
        </span>
      )}
    </button>
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
