import { useLocation } from 'react-router-dom'
import { useSim } from '@/data/store'
import { useRunStore } from '@/data/runState'

/**
 * One line on the page being read, for the footer's left half. The top
 * bar is the same on every page, so this is where the page names
 * itself — what it shows and where its numbers come from.
 */
const PAGE_NOTES: { path: string; name: string; note: string }[] = [
  { path: '/', name: 'Overview', note: 'the junction live — signal state, lanes, and what the engine decided' },
  { path: '/analytics', name: 'Analytics', note: 'the run in progress, read from the live stream' },
  { path: '/performance', name: 'Performance', note: 'Trinetra against vehicle-actuated control, in lockstep on one scenario' },
  { path: '/decisions', name: 'Decisions', note: 'every decision of a run, with its scores and reason — from the database' },
  { path: '/settings', name: 'Simulation Settings', note: 'which scenario each page runs' },
]

/** Thin footer: what page this is on the left; on the right, where the
 * data comes from — the backend host and the link to it — since the
 * status bar already carries the simulation's clock and rate. A
 * dark glass strip at the foot of the frosted container. */
export function FooterBar() {
  const link = useSim((s) => s.link)
  const run = useRunStore((s) => s.state)
  const { pathname } = useLocation()
  const host = typeof window !== 'undefined' ? window.location.host : ''
  const source = run?.available === false
    ? 'evaluator dashboard'
    : run?.managed
      ? 'console'
      : run
        ? 'simulation process'
        : 'backend'
  const page = PAGE_NOTES.find((p) => (p.path === '/' ? pathname === '/' : pathname.startsWith(p.path)))
  return (
    <footer
      className="flex h-8 shrink-0 items-center justify-between gap-4 px-[18px] text-[11.5px] text-white/75"
      style={{ background: 'rgb(6 10 20 / 0.35)', borderTop: '1px solid rgb(255 255 255 / 0.12)' }}
    >
      <span className="min-w-0 truncate">
        {page ? (
          <>
            <span className="display text-[11px] tracking-[0.06em] text-white">{page.name.toUpperCase()}</span>
            <span className="opacity-70"> · </span>
            {page.note}
          </>
        ) : (
          'Trinetra'
        )}
      </span>
      <span className="num shrink-0">
        SUMO · TraCI · {source} {host}
        <span className="opacity-70"> · </span>
        {link === 'open' ? 'stream open' : link === 'connecting' ? 'connecting' : 'stream closed'}
      </span>
    </footer>
  )
}
