import { useEffect, useMemo, useState } from 'react'
import { Panel } from '@/components/common/Panel'
import { api } from '@/services/api'
import type { DecisionLogRow } from '@/types/logs'
import { modeMeta, phaseLabel } from '@/utils/theme'
import { Badge } from '@/components/common/Badge'
import { fmt1, fmtSeconds } from '@/utils/format'

type ModeFilter = 'all' | string
type PhaseFilter = 'all' | string

export function LogsPage() {
  const [rows, setRows] = useState<DecisionLogRow[] | null>(null)
  const [error, setError] = useState(false)
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all')

  useEffect(() => {
    api
      .decisionLogs(300)
      .then(setRows)
      .catch(() => setError(true))
  }, [])

  // db_logger's decision_log table stores each row independently and has
  // no stored "switched" flag (only the in-memory Decision object had
  // one) - a switch event is derived here by comparing each row's phase
  // to the row immediately before it, in chronological order.
  const withSwitchFlag = useMemo(() => {
    if (!rows) return []
    const chronological = [...rows].sort((a, b) => a.time - b.time)
    const flagged = chronological.map((row, i) => ({
      ...row,
      isSwitch: i === 0 ? false : chronological[i - 1].phase !== row.phase,
    }))
    return flagged.reverse() // back to newest-first for display
  }, [rows])

  const modes = useMemo(() => [...new Set((rows ?? []).map((r) => r.mode))], [rows])
  const phases = useMemo(() => [...new Set((rows ?? []).map((r) => r.phase))], [rows])

  const filtered = withSwitchFlag.filter(
    (r) => (modeFilter === 'all' || r.mode === modeFilter) && (phaseFilter === 'all' || r.phase === phaseFilter),
  )

  return (
    <div className="space-y-6">
      <Panel title="Decision Log" eyebrow="From decision_log (SQLite) · most recent first" noPad>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border-soft)] p-3">
          <FilterSelect label="Mode" value={modeFilter} options={modes} onChange={setModeFilter} render={(m) => modeMeta(m).label} />
          <FilterSelect label="Phase" value={phaseFilter} options={phases} onChange={setPhaseFilter} render={phaseLabel} />
          {rows && <span className="ml-auto text-[11px] text-[var(--color-text-faint)]">{filtered.length} of {rows.length} rows</span>}
        </div>

        {error && (
          <div className="p-6 text-center text-xs text-[var(--color-text-faint)]">
            Couldn't load decision_log - the database may not exist yet (run the backend at least once).
          </div>
        )}
        {!error && !rows && <div className="p-6 text-center text-xs text-[var(--color-text-faint)]">Loading…</div>}
        {!error && rows && rows.length === 0 && (
          <div className="p-6 text-center text-xs text-[var(--color-text-faint)]">No decisions logged yet.</div>
        )}

        {!error && rows && rows.length > 0 && (
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-[var(--color-panel)]">
                <tr className="text-[10px] uppercase tracking-wide text-[var(--color-text-faint)]">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Phase</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                  <th className="px-3 py-2 font-medium">Switch</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const meta = modeMeta(row.mode)
                  return (
                    <tr key={row.id} className="border-t border-[var(--color-border-soft)]">
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular text-[var(--color-text-dim)]">
                        T+{fmtSeconds(row.time)}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text)]">{phaseLabel(row.phase)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular text-[var(--color-text-dim)]">
                        {fmt1(row.duration)}s
                      </td>
                      <td className="px-3 py-2">
                        <Badge label={meta.label} color={meta.color} dim={meta.dim} />
                      </td>
                      <td className="px-3 py-2">
                        {row.isSwitch ? (
                          <span className="text-[11px] font-medium text-[var(--color-neutral)]">switched</span>
                        ) : (
                          <span className="text-[11px] text-[var(--color-text-faint)]">held</span>
                        )}
                      </td>
                      <td className="max-w-md px-3 py-2 text-[var(--color-text-dim)]">{row.reason}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  render,
}: {
  label: string
  value: T | 'all'
  options: T[]
  onChange: (v: T | 'all') => void
  render: (v: T) => string
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-faint)]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T | 'all')}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel-inset)] px-2 py-1 text-[11px] text-[var(--color-text)]"
      >
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {render(o)}
          </option>
        ))}
      </select>
    </label>
  )
}
