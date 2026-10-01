import clsx from 'clsx'
import type { DecisionView, SignalView } from '@/data/types'
import { useLiveClock } from '@/data/useLiveClock'
import { Glyph, Panel, type GlyphState } from '@/ui/Panel'
import { MAX_GREEN, MIN_GREEN } from '@/utils/phaseWindows'
import { modeMeta, phaseAxis, phaseLabel } from '@/utils/signal'

/**
 * Active phase, and the closed loop made visible: what the decision
 * engine chose vs. what the traffic light in SUMO is actually showing.
 * The two differ only during the 3 s amber clearance between phases —
 * that is normal, and it is never styled as a fault.
 *
 * The gauge is honest about what the backend measures: during green it is
 * the time the phase has been HELD (decision.duration, simulated seconds)
 * against the phase's max green, with the min-green tick on the ring —
 * which is what the engine reasons about — and during clearance it is the
 * amber countdown.
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
    ? { label: 'Light is showing the decided phase', tone: 'green' }
    : clearing
      ? { label: `Amber — switching to ${phaseLabel(decided)}`, tone: 'amber' }
      : showing
        ? { label: 'Waiting for the light to confirm', tone: 'amber' }
        : { label: 'No signal state yet', tone: 'off' }

  const min = MIN_GREEN[decided]
  const max = MAX_GREEN[decided]
  const held = heldSeconds ?? 0
  const frac = clearing ? Math.min(1, (clearance ?? 0) / 3) : max ? Math.min(1, held / max) : 0
  const minFrac = max && min ? min / max : 0
  const axis = phaseAxis(decided)
  const lamp: GlyphState = !powered || !signal ? 'red' : clearing ? 'amber' : signal.green ? 'green' : 'red'
  const sub = !powered
    ? 'No simulation running'
    : clearing
      ? 'Amber clearance before the next phase'
      : axis
        ? `Green for ${axis === 'NS' ? 'North–South' : 'East–West'} ${decided.endsWith('right') ? 'right turns' : 'movement'}`
        : '—'

  return (
    <Panel explain="active-phase"
      title="Active phase"
      glyph={lamp}
      meta={powered && heldSeconds != null ? <span>{clearing ? 'amber' : 'green'} · simulated</span> : undefined}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2.5">
            <Glyph s={lamp} className="mt-0.5" />
            <div className="min-w-0">
              <div className="text-[16.5px] font-semibold leading-tight text-ink-strong">{powered ? phaseLabel(decided) : '—'}</div>
              <div className="mt-1 text-[12.5px] text-ink">{sub}</div>
            </div>
          </div>
          <div className="mt-4 flex gap-2.5">
            <RingChip label="N–S ring" on={powered && axis === 'NS'} />
            <RingChip label="E–W ring" on={powered && axis === 'EW'} />
          </div>
          {/* held vs max-green window, with the min-green tick — the constraint made visible */}
          <div className="relative mt-3.5 h-[9px] w-full overflow-hidden rounded-full bg-[rgb(18_30_56/0.08)]" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{
                width: `${(powered ? frac : 0) * 100}%`,
                background: clearing ? 'linear-gradient(90deg, #FCD34D, #F59E0B)' : 'linear-gradient(90deg, #34D399, #10B981)',
                boxShadow: clearing ? '0 0 10px rgb(245 158 11 / 0.8)' : '0 0 10px rgb(16 185 129 / 0.8)',
                transition: 'width var(--dur-value) linear',
              }}
            />
            {!clearing && max != null && (
              <div className="absolute top-0 h-full w-0.5 bg-ink-strong/70" style={{ left: `${minFrac * 100}%` }} title={`min green ${min} s`} />
            )}
          </div>
        </div>
        <Gauge
          frac={powered ? frac : 0}
          minFrac={clearing ? null : minFrac}
          clearing={clearing}
          value={
            clearing ? (clearance == null ? '—' : `${clearance.toFixed(1)}s`) : heldSeconds == null ? '—' : `${Math.floor(held)}s`
          }
          caption={clearing ? 'AMBER LEFT' : 'GREEN HELD'}
          window={!clearing && min != null && max != null ? `min ${min} s · max ${max} s` : clearing ? 'clearance' : 'simulated'}
        />
      </div>

      <div className="mt-5 rounded-[14px] border border-[rgb(18_30_56/0.07)] bg-[rgb(18_30_56/0.035)] px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <span
            className={clsx(
              'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium',
              mode.loud ? 'loud-chip border-transparent text-white' : 'border-[#9fd9bd] bg-[#e5f6ee] text-[#065f3a]',
            )}
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full', mode.loud ? 'bg-white' : 'bg-[#12B76A]')} />
            {mode.label}
          </span>
          {mode.describe && <span className="pt-0.5 text-[12px] leading-[1.4] text-ink-mute">{mode.describe}</span>}
        </div>
        <p className="mt-1.5 max-w-[62ch] text-[13px] leading-[1.5] text-ink">{decision.reason || 'Awaiting first decision tick.'}</p>
      </div>

      <div className="mt-2.5 text-[13px]">
        <div className="mb-1 text-[11.5px] leading-[1.45] text-ink-mute">
          The engine decides a phase; the light in SUMO changes only after a 3 s amber, and TraCI reports what it is actually showing.
        </div>
        <Row label="Engine decided" value={decided} sub={mode.label.toLowerCase()} />
        <Row
          label="Light showing"
          value={showing ?? '—'}
          sub={signal ? (clearing ? 'amber' : signal.green ? 'green' : 'red') : 'no signal reported'}
        />
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-ink">Match</span>
          <span
            className="inline-flex min-h-8 items-center gap-2 rounded-full border px-3.5 py-1 text-right text-[12.5px] leading-[1.3]"
            style={
              status.tone === 'green'
                ? { background: 'rgb(18 183 106 / 0.12)', borderColor: 'rgb(18 183 106 / 0.28)', color: '#067647' }
                : status.tone === 'amber'
                  ? { background: 'rgb(245 162 11 / 0.13)', borderColor: 'rgb(245 162 11 / 0.35)', color: '#8A5200' }
                  : { background: 'var(--surface-inset)', borderColor: 'var(--rule)', color: 'var(--ink)' }
            }
          >
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" />
            {status.label}
          </span>
        </div>
      </div>
    </Panel>
  )
}

function RingChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex h-[34px] items-center whitespace-nowrap rounded-[12px] border px-[15px] text-[13px] font-medium transition-colors',
        on ? 'border-transparent text-white' : 'border-[rgb(18_30_56/0.1)] bg-[rgb(18_30_56/0.05)] text-ink',
      )}
      style={
        on
          ? {
              background: 'linear-gradient(180deg, #1FC98E, #0E9F6E)',
              boxShadow: '0 6px 16px -6px rgb(14 159 110 / 0.85), inset 0 1px 0 rgb(255 255 255 / 0.35)',
            }
          : undefined
      }
    >
      {label}
    </span>
  )
}

/** The round dial: held (or amber) fraction as an arc on a dark face. */
function Gauge({
  frac,
  minFrac,
  clearing,
  value,
  caption,
  window,
}: {
  frac: number
  minFrac: number | null
  clearing: boolean
  value: string
  caption: string
  window: string
}) {
  const R = 58
  const C = 2 * Math.PI * R
  const col = clearing ? '#FFB020' : '#2AF28E'
  const tick = minFrac != null && minFrac > 0 ? minFrac * 2 * Math.PI - Math.PI / 2 : null
  return (
    <div className="relative flex w-[136px] shrink-0 flex-col items-center">
      <div className="relative h-[136px] w-[136px]" style={{ filter: 'drop-shadow(0 12px 20px rgb(3 8 24 / 0.4))' }}>
        <svg viewBox="0 0 136 136" className="absolute inset-0" aria-hidden>
          <circle cx="68" cy="68" r="66" fill="#0B1220" />
          <circle cx="68" cy="68" r={R} fill="none" stroke="#16223E" strokeWidth="8" />
          <circle
            cx="68"
            cy="68"
            r={R}
            fill="none"
            stroke={col}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`}
            transform="rotate(-90 68 68)"
            style={{ filter: `drop-shadow(0 0 5px ${col})`, transition: 'stroke-dasharray var(--dur-value) linear' }}
          />
          {tick != null && (
            <line
              x1={68 + Math.cos(tick) * (R - 7)}
              y1={68 + Math.sin(tick) * (R - 7)}
              x2={68 + Math.cos(tick) * (R + 7)}
              y2={68 + Math.sin(tick) * (R + 7)}
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-[10.5px] font-medium tracking-[0.06em] text-[#D5E7FF]">{caption}</span>
          <span className="num text-[30px] font-semibold leading-none" style={{ color: col, textShadow: `0 0 12px ${col}` }}>
            {value}
          </span>
        </div>
      </div>
      <span className="num mt-1.5 whitespace-nowrap text-[11.5px] text-ink-mute">{window}</span>
    </div>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-ink">{label}</span>
      <span className="text-right">
        <span className="num font-medium text-ink-strong">{value}</span>
        <span className="ml-1.5 text-[12.5px] text-[#1D4ED8]">({sub})</span>
      </span>
    </div>
  )
}
