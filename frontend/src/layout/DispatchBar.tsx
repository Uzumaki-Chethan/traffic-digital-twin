import { useState } from 'react'
import { Siren } from 'lucide-react'
import clsx from 'clsx'
import { runControl, useRunStore } from '@/data/runState'
import { usePageContext } from '@/data/pageContext'

/**
 * Send an emergency vehicle into the run that is on now: which kind,
 * from which approach, turning which way. Shown only while this page's
 * own run is live on the console. On Performance the vehicle enters both
 * simulations at once (the backend's rule, so the comparison stays a
 * comparison); the bar says so.
 *
 * The lane is not chosen here on purpose: on this network each lane
 * carries exactly one movement, so the turn IS the lane, and the engine
 * gives green to that lane's phase the moment the vehicle is detected.
 */

const TYPES = [
  { id: 'ambulance', label: 'Ambulance' },
  { id: 'fire_engine', label: 'Fire engine' },
  { id: 'police_vehicle', label: 'Police' },
] as const
const APPROACHES = [
  { id: 'N', label: 'North' },
  { id: 'S', label: 'South' },
  { id: 'E', label: 'East' },
  { id: 'W', label: 'West' },
] as const
const TURNS = [
  { id: 'left', label: 'turning left' },
  { id: 'straight', label: 'going straight' },
  { id: 'right', label: 'turning right' },
] as const

export function DispatchBar() {
  const run = useRunStore((s) => s.state)
  const busy = useRunStore((s) => s.busy)
  const page = usePageContext()
  const [type, setType] = useState<(typeof TYPES)[number]['id']>('ambulance')
  const [approach, setApproach] = useState<(typeof APPROACHES)[number]['id']>('N')
  const [turn, setTurn] = useState<(typeof TURNS)[number]['id']>('straight')
  const [sent, setSent] = useState<number | null>(null)

  if (!run?.managed || !page.running) return null
  const count = run.dispatched ?? 0

  const send = async () => {
    await runControl.dispatch(type, approach, turn)
    setSent(Date.now())
    window.setTimeout(() => setSent(null), 1500)
  }

  const select = 'appearance-none rounded-control border border-rule bg-plate py-1 pl-2 pr-6 text-[12.5px] font-medium text-ink-strong hover:border-[var(--rule-strong)]'

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-rule bg-plate px-2.5 py-1.5 text-[12.5px] text-ink">
      <span className="flex items-center gap-1.5 font-semibold text-ink-strong">
        <Siren size={14} aria-hidden className="text-[var(--signal-red)]" />
        Dispatch
      </span>
      <Sel value={type} onChange={(v) => setType(v as typeof type)} options={TYPES} className={select} label="Vehicle" />
      <span className="text-ink-mute">from</span>
      <Sel value={approach} onChange={(v) => setApproach(v as typeof approach)} options={APPROACHES} className={select} label="Approach" />
      <Sel value={turn} onChange={(v) => setTurn(v as typeof turn)} options={TURNS} className={select} label="Turn" />
      <button
        type="button"
        onClick={() => void send()}
        disabled={busy || run.paused}
        title={run.paused ? 'Resume the run to dispatch' : page.kind === 'evaluation' ? 'Enters both simulations at the same moment' : 'Enters the simulation now'}
        className={clsx(
          'rounded-control border px-2.5 py-1 text-[12.5px] font-semibold transition-colors',
          busy || run.paused
            ? 'cursor-not-allowed border-rule text-ink-mute'
            : 'border-[var(--ink-strong)] bg-ink-strong text-ink-on-dark hover:opacity-90',
        )}
      >
        {sent ? 'Sent' : 'Send'}
      </button>
      <span className="num text-[11.5px] text-ink-mute">
        {count === 0 ? 'none this run' : `${count} this run`}
        {page.kind === 'evaluation' && ' · both sides'}
      </span>
    </div>
  )
}

function Sel({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: readonly { id: string; label: string }[]
  className: string
  label: string
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
