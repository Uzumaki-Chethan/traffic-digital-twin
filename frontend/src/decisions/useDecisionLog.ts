import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type DecisionLogRow, type RunSummary } from '@/data/api'
import { useRunStore } from '@/data/runState'

/**
 * The Decisions page's data: the runs the database holds, the selected
 * run's decisions (oldest first, complete), and — while that run is the
 * one on the console right now — the new rows as they are written, by
 * asking for everything after the newest id every couple of seconds.
 * The only page that reads the database (Section 23.4 kept Analytics
 * on the live stream), and the only one that can show a run after it
 * has ended.
 *
 * Nothing is derived that the backend does not carry: a row written
 * before 2026-09-17 has no scores, margin or actual state, and the page
 * shows that as absent rather than guessing.
 */

const PAGE = 1000
const FOLLOW_MS = 2000
const RUNS_MS = 5000
const EMPTY_ROWS: DecisionLogRow[] = []

export interface DecisionLog {
  runs: RunSummary[]
  runsLoaded: boolean
  selectedRun: string | null
  selectRun: (id: string) => void
  rows: DecisionLogRow[]
  rowsLoaded: boolean
  /** The selected run is the one being written right now. */
  live: boolean
  error: string | null
}

export function useDecisionLog(): DecisionLog {
  const runState = useRunStore((s) => s.state)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [runsLoaded, setRunsLoaded] = useState(false)
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  // Rows are kept with the run they belong to, so "loaded" is derived
  // (data.run === selectedRun) rather than flagged, and switching runs
  // never shows the previous run's rows under the new run's name.
  const [data, setData] = useState<{ run: string; rows: DecisionLogRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const userChose = useRef(false)
  const rows = data !== null && data.run === selectedRun ? data.rows : EMPTY_ROWS
  const rowsLoaded = data !== null && data.run === selectedRun
  const lastId = useRef(0)
  useEffect(() => {
    lastId.current = rows.length ? rows[rows.length - 1].id : 0
  }, [rows])

  const running = runState?.running === true && (runState.kind ?? 'demo') === 'demo'
  const newest = runs[0]?.run_id ?? null
  const live = running && selectedRun !== null && selectedRun === newest

  // The run list: once, then every few seconds while a demo is running
  // (a new run appears in it a tick after it starts writing).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const list = await api.runs()
        if (cancelled) return
        setRuns(list)
        setRunsLoaded(true)
        setError(null)
        // Follow the newest run unless the reader picked another.
        if (!userChose.current && list[0]) setSelectedRun(list[0].run_id)
      } catch (e: unknown) {
        if (!cancelled) {
          setRunsLoaded(true)
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    }
    void load()
    const id = running ? window.setInterval(() => void load(), RUNS_MS) : undefined
    return () => {
      cancelled = true
      if (id !== undefined) window.clearInterval(id)
    }
  }, [running])

  // The selected run's decisions, complete, oldest first.
  useEffect(() => {
    if (!selectedRun) return
    let cancelled = false
    const run = selectedRun
    const load = async () => {
      try {
        // Walk the run forward from its first row with after_id, a page
        // at a time, so a long run is complete rather than capped at the
        // API's 1000-row limit.
        const all: DecisionLogRow[] = []
        let afterId = 0
        for (let pages = 0; pages < 40; pages++) {
          const batch = await api.decisionLogs(PAGE, run, afterId)
          all.push(...batch)
          if (batch.length < PAGE) break
          afterId = batch[batch.length - 1].id
        }
        if (cancelled) return
        setData({ run, rows: all })
        setError(null)
      } catch (e: unknown) {
        if (!cancelled) {
          setData({ run, rows: [] })
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedRun])

  // Follow the live run: everything after the newest id we hold.
  useEffect(() => {
    if (!live || !rowsLoaded || !selectedRun) return
    let cancelled = false
    const run = selectedRun
    const tick = async () => {
      try {
        const fresh = await api.decisionLogs(PAGE, run, lastId.current)
        if (cancelled || fresh.length === 0) return
        setData((prev) => {
          if (!prev || prev.run !== run) return prev
          const seen = prev.rows.length ? prev.rows[prev.rows.length - 1].id : 0
          return { run, rows: [...prev.rows, ...fresh.filter((r) => r.id > seen)] }
        })
      } catch {
        // A missed poll is not an error worth showing; the next one catches up.
      }
    }
    const id = window.setInterval(() => void tick(), FOLLOW_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [live, rowsLoaded, selectedRun])

  const selectRun = useCallback((id: string) => {
    userChose.current = true
    setSelectedRun(id)
  }, [])

  return { runs, runsLoaded, selectedRun, selectRun, rows, rowsLoaded, live, error }
}
