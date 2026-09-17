import clsx from 'clsx'
import type { DecisionView, SignalView } from '@/data/types'
import { useLiveClock } from '@/data/useLiveClock'
import { Panel } from '@/ui/Panel'
import { MAX_GREEN, MIN_GREEN } from '@/utils/phaseWindows'
import { modeMeta, phaseLabel } from '@/utils/signal'

/**
 * Active phase, and the closed loop made visible: what the decision
 * engine chose vs. what the traffic light in SUMO is actually showing.
 * The two differ only during the 3 s amber clearance between phases —
 * that is normal, and it is never styled as a fault.
 *
 * The hero numeral is honest about what the backend measures: during
 * green it is the time the phase has been HELD (decision.duration,
 * simulated seconds) against the phase's min/max window — which is what
 * the engine reasons about — and during clearance it is the amber
 * countdown.
 */
export function PhasePanel({
  decision,
  signal,
  powered = true,
}: {
  decision: DecisionView
  signal: SignalView | null
  /** False while this page shows no run: the clock is not read. */
  powered?: boolean
}) {
  const clock = useLiveClock()
  // The clock follows whatever frames are on the wire — an evaluation's
  // AI side included — so an unpowered panel must not read it, or the
  // "green held" counter runs for a run this page is not showing.
  const heldSeconds = powered ? clock.heldSeconds : null
  const clearance = powered ? clock.clearance : null
  const mode = modeMeta(decision.mode)

  const decided = decision.active_phase
  const showing = signal?.phase ?? null
  const clearing = !!signal?.is_yellow
  const agrees = showing === decided && !clearing
  const status = agrees
    ? { label: 'Light is showing the decided phase', ok: true }
    : clearing
      ? { label: `Amber — switching to ${phaseLabel(decided)}`, ok: false }
      : showing
        ? { label: 'Waiting for the light to confirm', ok: false }
        : { label: 'No signal state yet', ok: false }

  const min = MIN_GREEN[decided]
  const max = MAX_GREEN[decided]
  const held = heldSeconds ?? 0
  const frac = max ? Math.min(1, held / max) : 0
  const minFrac = max && min ? min / max : 0

  return (
    <Panel title="Active phase">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="num text-[16px] font-semibold text-ink-strong">{decided}</div>
          <div className="mt-0.5 text-[13px] text-ink-mute">{phaseLabel(decided)}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-[12px] text-ink-mute">{clearing ? 'Amber remaining' : 'Green held'}</span>
          <span className="num text-[36px] font-semibold leading-none tracking-[-0.015em] text-ink-strong">
            {clearing ? (clearance == null ? '—' : `${clearance.toFixed(1)}s`) : heldSeconds == null ? '—' : `${Math.floor(held)}s`}
          </span>
          <span className="num mt-0.5 text-[12px] text-ink-mute">
            {clearing ? 'simulated' : min != null && max != null ? `sim · min ${min} s · max ${max} s` : 'simulated'}
          </span>
        </div>
      </div>

      {/* held vs max-green window, with the min-green tick — the constraint made visible */}
      {!clearing && max != null && (
        <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-inset" aria-hidden>
          <div
            className={clsx('h-full rounded-full', frac >= 0.85 ? 'bg-ink-strong' : 'bg-accent')}
            style={{ width: `${frac * 100}%`, transition: 'width var(--dur-value) linear' }}
          />
          <div className="absolute top-[-2px] h-[10px] w-px bg-ink-strong" style={{ left: `${minFrac * 100}%` }} title={`min green ${min} s`} />
        </div>
      )}

      <div className="mt-2.5 rounded-control bg-inset px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'rounded-chip px-2 py-0.5 text-[12px] font-semibold',
              mode.loud ? 'bg-lamp-red text-white' : 'bg-accent-soft text-ink-strong',
            )}
          >
            {mode.label}
          </span>
          {mode.describe && <span className="text-[12.5px] text-ink-mute">{mode.describe}</span>}
        </div>
        <p className="mt-1.5 max-w-[62ch] text-[13px] leading-[1.45] text-ink-strong">{decision.reason || 'Awaiting first decision tick.'}</p>
      </div>

      <div className="mt-2 text-[12.5px]">
        <div className="mb-1 text-[12px] text-ink-mute">
          The engine decides a phase; the light in SUMO changes only after a 3 s amber, and TraCI reports what it is actually showing.
        </div>
        <Row label="Engine decided" value={decided} sub={mode.label.toLowerCase()} />
        <Row
          label="Light showing"
          value={showing ?? '—'}
          sub={signal ? (clearing ? 'amber' : signal.green ? 'green' : 'red') : 'no signal reported'}
        />
        <div className="flex items-center justify-between gap-2 pt-1.5">
          <span className="text-ink-mute">Match</span>
          <span
            className={clsx(
              'rounded-chip px-2 py-0.5 text-[12px] font-semibold',
              status.ok ? 'bg-ink-strong text-ink-on-dark' : 'bg-inset text-ink-strong',
            )}
          >
            {status.label}
          </span>
        </div>
      </div>
    </Panel>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-rule-soft py-1.5">
      <span className="text-ink-mute">{label}</span>
      <span className="text-right">
        <span className="num font-semibold text-ink-strong">{value}</span>
        <span className="ml-1.5 text-[12px] text-ink-mute">{sub}</span>
      </span>
    </div>
  )
}
