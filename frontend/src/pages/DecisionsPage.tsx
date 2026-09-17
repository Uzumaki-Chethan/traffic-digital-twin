import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import { Panel } from '@/ui/Panel'
import { Reveal } from '@/ui/Reveal'
import { useDecisionLog } from '@/decisions/useDecisionLog'
import { DecisionList } from '@/decisions/DecisionList'
import { DecisionDetail } from '@/decisions/DecisionDetail'
import { scenarioName } from '@/data/scenarios'
import { modeMeta } from '@/utils/signal'
import { clock } from '@/utils/format'
import type { RunSummary } from '@/data/api'

/**
 * The audit trail: every decision of a run, from the database — the one
 * page that can show a run after it has ended, or an earlier run. A run
 * picker (newest first), the rules as filter chips with their counts, a
 * dense windowed list, and the opened decision on the right with its
 * score ledger and desired-vs-actual pair. Follows the live run as it
 * writes.
 *
 * Evaluations (Performance) never write the database, so only demo runs
 * appear here; their record is the CSV under results/.
 */
export function DecisionsPage() {
  const log = useDecisionLog()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [modeFilter, setModeFilter] = useState<string | null>(null)
  const [switchesOnly, setSwitchesOnly] = useState(false)

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const r of log.rows) c.set(r.mode, (c.get(r.mode) ?? 0) + 1)
    return c
  }, [log.rows])

  // The phase each decision replaced, on the FULL run, so a filtered
  // list still marks real switches and not gaps in the filter.
  const previousPhase = useMemo(() => {
    const m = new Map<number, string | null>()
    for (let i = 0; i < log.rows.length; i++) m.set(log.rows[i].id, i > 0 ? log.rows[i - 1].phase : null)
    return m
  }, [log.rows])

  const switches = useMemo(() => {
    let n = 0
    for (let i = 1; i < log.rows.length; i++) if (log.rows[i].phase !== log.rows[i - 1].phase) n++
    return n
  }, [log.rows])

  const visible = useMemo(() => {
    if (!modeFilter && !switchesOnly) return log.rows
    return log.rows.filter((r, i) => {
      if (modeFilter && r.mode !== modeFilter) return false
      if (switchesOnly && !(i > 0 && log.rows[i - 1].phase !== r.phase)) return false
      return true
    })
  }, [log.rows, modeFilter, switchesOnly])

  const selectedIndex = selectedId === null ? -1 : log.rows.findIndex((r) => r.id === selectedId)
  const selected = selectedIndex >= 0 ? log.rows[selectedIndex] : null
  const previous = selectedIndex > 0 ? log.rows[selectedIndex - 1] : null
  const run = log.runs.find((r) => r.run_id === log.selectedRun) ?? null

  const empty = log.runsLoaded && log.runs.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Reveal index={0}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <span className="eyebrow">Run</span>
            <span className="relative">
              <select
                value={log.selectedRun ?? ''}
                onChange={(e) => log.selectRun(e.target.value)}
                disabled={log.runs.length === 0}
                className="appearance-none rounded-control border border-rule bg-plate py-1 pl-2.5 pr-7 text-[13px] font-medium text-ink-strong hover:border-[var(--rule-strong)] disabled:opacity-60"
              >
                {log.runs.length === 0 && <option value="">No runs recorded</option>}
                {log.runs.map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {runLabel(r)}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-mute" />
            </span>
          </label>
          {run && (
            <span className="num text-[12px] text-ink-mute">
              {log.rows.length.toLocaleString()} decisions · {switches} switches · {clock(run.last_time)} simulated
              {log.live && <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-ink)]">live</span>}
            </span>
          )}
        </div>
        {/* The filters on their own row, left-aligned at every width —
            in the picker's row they landed wherever its width left room. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip active={modeFilter === null && !switchesOnly} onClick={() => { setModeFilter(null); setSwitchesOnly(false) }}>
              All
            </Chip>
            <Chip active={switchesOnly} onClick={() => setSwitchesOnly((v) => !v)}>
              Switches <span className="num opacity-70">{switches}</span>
            </Chip>
            {[...counts.entries()].toSorted((a, b) => b[1] - a[1]).map(([mode, n]) => {
              const meta = modeMeta(mode)
              return (
                <Chip key={mode} active={modeFilter === mode} loud={meta.loud} onClick={() => setModeFilter((m) => (m === mode ? null : mode))}>
                  {meta.label} <span className="num opacity-70">{n}</span>
                </Chip>
              )
            })}
          </span>
        </div>
      </Reveal>

      {log.error && (
        <div className="rounded-control border border-alert bg-alert-wash px-3 py-1.5 text-[12.5px] text-alert">{log.error}</div>
      )}

      {empty ? (
        <Reveal index={1}>
          <Panel title="Decisions" bodyClassName="px-3.5 pb-3.5 pt-1">
            <p className="max-w-[60ch] text-[13px] leading-[1.55] text-ink">
              No decisions recorded yet. Every demo run writes one row per second here — its phase, the
              rule it was chosen by, the reason, the four phase scores and what the light was actually
              showing — and the last ten runs are kept. Start a run on Overview and it appears here as it
              writes.
            </p>
          </Panel>
        </Reveal>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] gap-2">
          <Reveal index={1} className="flex min-h-0 flex-col">
            <Panel
              title="Every decision"
              meta={
                <span className="flex items-center gap-2">
                  {visible.length !== log.rows.length && (
                    <span>
                      {visible.length.toLocaleString()} of {log.rows.length.toLocaleString()}
                    </span>
                  )}
                  <span className="hidden xl:inline">time · phase · held · rule · reason</span>
                </span>
              }
              className="h-full"
              bodyClassName="flex min-h-0 flex-1 flex-col px-2 pb-2"
            >
              {!log.rowsLoaded ? (
                <div className="py-6 text-center text-[12.5px] text-ink-mute">Loading this run…</div>
              ) : visible.length === 0 ? (
                <div className="py-6 text-center text-[12.5px] text-ink-mute">No decisions match this filter.</div>
              ) : (
                <DecisionList
                  rows={visible}
                  previousPhase={previousPhase}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  followLatest={log.live && selectedId === null}
                />
              )}
            </Panel>
          </Reveal>
          <Reveal index={2}>
            <DecisionDetail row={selected} previous={previous} />
          </Reveal>
        </div>
      )}
    </div>
  )
}

function runLabel(r: RunSummary): string {
  const started = new Date(r.run_id)
  const when = isNaN(started.getTime())
    ? r.run_id
    : started.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `${when} · ${scenarioName(r.scenario ?? 'default')} · ${clock(r.last_time)}`
}

function Chip({ active, loud, onClick, children }: { active: boolean; loud?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors',
        active
          ? 'border-[var(--ink-strong)] bg-ink-strong text-ink-on-dark'
          : loud
            ? 'border-[var(--signal-red)] text-[var(--signal-red)] hover:bg-hover'
            : 'border-rule bg-plate text-ink hover:bg-hover',
      )}
    >
      {children}
    </button>
  )
}
