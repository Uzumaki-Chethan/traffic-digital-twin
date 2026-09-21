import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import clsx from 'clsx'
import { runControl, useRunStore } from '@/data/runState'
import { usePageContext } from '@/data/pageContext'
import { APPROACHES, Sel, TURNS } from './DispatchBar'

/**
 * Stall a vehicle on the run that is on now: which kind, from which
 * approach, turning which way — an ad hoc accident, on demand, on any of
 * the twelve lanes, alongside the scripted `accident` scenario's own
 * East-approach truck. Same shape as DispatchBar, the same reason the
 * lane is not chosen directly (the turn IS the lane on this network).
 * The stopped vehicle gets a hazard marker in both views for as long as
 * it blocks its lane (VehicleLayer.tsx, Junction3D.tsx).
 */

const TYPES = [
  { id: 'truck', label: 'Truck' },
  { id: 'bus', label: 'Bus' },
  { id: 'car_normal', label: 'Car' },
] as const

export function IncidentBar() {
  const run = useRunStore((s) => s.state)
  const busy = useRunStore((s) => s.busy)
  const page = usePageContext()
  const [type, setType] = useState<(typeof TYPES)[number]['id']>('truck')
  const [approach, setApproach] = useState<(typeof APPROACHES)[number]['id']>('E')
  const [turn, setTurn] = useState<(typeof TURNS)[number]['id']>('straight')
  const [sent, setSent] = useState<number | null>(null)

  if (!run?.managed || !page.running) return null
  const count = run.incidents ?? 0

  const send = async () => {
    await runControl.stall(type, approach, turn)
    setSent(Date.now())
    window.setTimeout(() => setSent(null), 1500)
  }

  const select = 'appearance-none rounded-control border border-rule bg-plate py-1 pl-2 pr-6 text-[12.5px] font-medium text-ink-strong hover:border-[var(--rule-strong)]'

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-rule bg-plate px-2.5 py-1.5 text-[12.5px] text-ink">
      <span className="flex items-center gap-1.5 font-semibold text-ink-strong">
        <TriangleAlert size={14} aria-hidden className="text-[var(--alert)]" />
        Incident
      </span>
      <Sel value={type} onChange={(v) => setType(v as typeof type)} options={TYPES} className={select} label="Vehicle" />
      <span className="text-ink-mute">on</span>
      <Sel value={approach} onChange={(v) => setApproach(v as typeof approach)} options={APPROACHES} className={select} label="Approach" />
      <Sel value={turn} onChange={(v) => setTurn(v as typeof turn)} options={TURNS} className={select} label="Turn" />
      <button
        type="button"
        onClick={() => void send()}
        disabled={busy || run.paused}
        title={run.paused ? 'Resume the run to stall a vehicle' : page.kind === 'evaluation' ? 'Enters both simulations at the same moment' : 'Stalls it on that lane now'}
        className={clsx(
          'rounded-control border px-2.5 py-1 text-[12.5px] font-semibold transition-colors',
          busy || run.paused
            ? 'cursor-not-allowed border-rule text-ink-mute'
            : 'border-[var(--ink-strong)] bg-ink-strong text-ink-on-dark hover:opacity-90',
        )}
      >
        {sent ? 'Sent' : 'Stall'}
      </button>
      <span className="num text-[11.5px] text-ink-mute">
        {count === 0 ? 'none this run' : `${count} this run`}
        {page.kind === 'evaluation' && ' · both sides'}
      </span>
    </div>
  )
}
