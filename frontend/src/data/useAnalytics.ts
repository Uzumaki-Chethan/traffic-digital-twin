import { useEffect, useState } from 'react'

export interface Async<T> {
  data: T | null
  loading: boolean
  /** Set when the request failed outright (server down, 500, bad JSON). */
  error: string | null
}

/**
 * Mount-once fetch for the read-only history endpoints (`data/api.ts`),
 * which read SQLite and the saved evaluator CSVs.
 *
 * CURRENTLY UNUSED. Analytics moved to the live stream on 2026-09-12 (see
 * data/liveHistory.ts for why), so nothing fetches history today. Kept
 * because the Performance and Decisions pages are exactly what these
 * endpoints are for: past evaluation runs and a decision audit trail that
 * outlives the run that produced it. Note that under `python app.py` these
 * endpoints die with the simulation — `python server.py` is what keeps them
 * served afterwards.
 *
 * Deliberately fires exactly once per mount: the fetcher is held in a ref
 * so a fresh closure on re-render can't retrigger it, and the request is
 * aborted on unmount. Recorded history doesn't change under us mid-view;
 * anything that needs to follow live state reads the store instead.
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: null, loading: true, error: null })

  useEffect(() => {
    const ctrl = new AbortController()
    let alive = true
    // `fn` is intentionally not a dependency: callers pass an inline
    // arrow, so a fresh closure every render would refetch forever. The
    // mount-time closure is the one we want.
    fn(ctrl.signal)
      .then((data) => {
        if (alive) setState({ data, loading: false, error: null })
      })
      .catch((e: unknown) => {
        if (!alive || ctrl.signal.aborted) return
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      alive = false
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}
