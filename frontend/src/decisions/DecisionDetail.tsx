import clsx from 'clsx'
import { Panel } from '@/ui/Panel'
import { ScoreLedger } from '@/overview/ScoreLedger'
import type { DecisionLogRow } from '@/data/api'
import type { DecisionView } from '@/data/types'
import { phaseLabel, modeMeta } from '@/utils/signal'
import { clock } from '@/utils/format'

/**
 * One decision, opened: the score ledger as it stood on that tick (the
 * same panel Overview shows live, fed from the row's stored scores and
 * margin), what the engine decided against what the light was actually
 * showing, and the full reason. A row from before the scores were
 * stored says so rather than drawing an empty ledger.
 */
export function DecisionDetail({ row, previous }: { row: DecisionLogRow | null; previous: DecisionLogRow | null }) {
  if (!row) {
    return (
      <Panel title="Decision" bodyClassName="px-3.5 pb-3.5 pt-1">
        <div className="py-6 text-center text-[12.5px] text-ink-mute">Select a decision to open it.</div>
      </Panel>
    )
  }

  const mode = modeMeta(row.mode)
  const switched = previous !== null && previous.phase !== row.phase
  const decision: DecisionView | null = row.phase_scores
    ? {
        active_phase: row.phase,
        mode: row.mode,
        switched,
        reason: row.reason,
        duration: row.duration,
        phase_scores: row.phase_scores,
        margin: row.margin ?? 0,
      }
    : null

  // Desired vs actual, as PhasePanel reads it: a mismatch during amber
  // is the clearance in progress, never a fault.
  const actual = row.actual_phase
  const amber = row.actual_is_yellow === true
  const match = actual === null ? null : actual === row.phase && !amber
  const matchLabel =
    actual === null
      ? 'not recorded for this row'
      : amber
        ? actual === row.phase
          ? 'amber — clearing into the decided phase'
          : `amber — clearing ${phaseLabel(actual)} for the decided phase`
        : match
          ? 'light is showing the decided phase'
          : `light still on ${phaseLabel(actual)}`

  return (
    <div className="flex flex-col gap-2">
      <Panel
        title={`Decision at ${clock(row.time)}`}
        meta={<span className="num">held {row.duration.toFixed(0)} s</span>}
        bodyClassName="px-3.5 pb-3.5 pt-1"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            {switched && previous ? (
              <div className="text-[12.5px] text-ink-mute">
                {phaseLabel(previous.phase)} <span aria-hidden>→</span>
              </div>
            ) : null}
            <div className="text-[18px] font-semibold leading-tight text-ink-strong">{phaseLabel(row.phase)}</div>
          </div>
          <span
            className={clsx(
              'shrink-0 rounded-chip px-2 py-0.5 text-[12px] font-semibold',
              mode.loud ? 'bg-lamp-red text-white' : 'bg-accent-soft text-ink-strong',
            )}
          >
            {mode.label}
          </span>
        </div>
        {mode.describe && <p className="mt-1.5 text-[12.5px] text-ink-mute">{mode.describe}</p>}
        <p className="mt-2 rounded-control bg-inset px-3 py-2 text-[13px] leading-[1.45] text-ink-strong">{row.reason}</p>

        <div className="mt-3 text-[12.5px]">
          <Row label="Engine decided" value={phaseLabel(row.phase)} sub={mode.label.toLowerCase()} />
          <Row
            label="Light showing"
            value={actual === null ? '—' : phaseLabel(actual)}
            sub={actual === null ? 'not recorded' : amber ? 'amber' : 'green'}
          />
          <div className="flex items-center justify-between gap-2 pt-1.5">
            <span className="text-ink-mute">Match</span>
            <span
              className={clsx(
                'rounded-chip px-2 py-0.5 text-[12px] font-semibold',
                match ? 'bg-ink-strong text-ink-on-dark' : 'bg-inset text-ink-strong',
              )}
            >
              {matchLabel}
            </span>
          </div>
        </div>
      </Panel>

      {decision ? (
        <ScoreLedger decision={decision} powered />
      ) : (
        <Panel title="Why this phase" bodyClassName="px-3.5 pb-3 pt-1">
          <div className="py-3 text-center text-[12.5px] text-ink-mute">
            Phase scores were not recorded for this decision (a run from before 17 Sep 2026).
          </div>
        </Panel>
      )}
    </div>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-rule-soft py-1.5">
      <span className="text-ink-mute">{label}</span>
      <span className="text-right">
        <span className="font-semibold text-ink-strong">{value}</span>
        {sub && <span className="ml-1.5 text-ink-mute">{sub}</span>}
      </span>
    </div>
  )
}
