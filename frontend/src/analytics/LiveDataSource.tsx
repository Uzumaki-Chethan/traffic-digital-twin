import { Panel } from '@/ui/Panel'
import { clock } from '@/utils/format'

/**
 * Where the numbers on this page come from, stated on the page itself —
 * and, since it is the obvious next question, what the database is for
 * if not this.
 *
 * Replaced the old "Recorded dataset" panel when Analytics moved to the
 * live stream on 2026-09-12. The database is still written exactly as
 * before: it is the audit trail, the source of the report's figures, and
 * what an AI-vs-baseline comparison is read back out of afterwards. It
 * is simply not what a page about the run happening right now should be
 * reading.
 */
export function LiveDataSource({ ticks, from, to }: { ticks: number; from: number; to: number }) {
  return (
    <Panel title="Where this data comes from">
      <p className="text-[13px] leading-[1.5] text-ink">
        Every chart above is built from the live WebSocket stream — one sample per decision tick, kept
        in the browser for the length of this run. Nothing on this page is fetched from the database,
        which is why it needs a simulation running and why it never shows another run mixed in.
      </p>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Count label="Ticks held" value={ticks.toLocaleString()} sub="one per decision, ~1 s apart" />
        <Count label="Covering" value={`${clock(from)} → ${clock(to)}`} sub="simulated time, this run" />
        <Count label="Per-lane readings" value={(ticks * 12).toLocaleString()} sub="12 lanes per tick" />
      </div>
      <ul className="mt-2.5 flex flex-col gap-1 border-t border-rule-soft pt-2 text-[12.5px] text-ink-mute">
        <li>
          <span className="text-ink">The database is still recording all of it</span> — insert-only and
          failure-tolerant, so a logging error can never interrupt the control loop. It is the audit
          trail and the source of the report&rsquo;s figures, not the source of this page.
        </li>
        <li>
          <span className="text-ink">Nothing here can influence the simulation</span>; this is a viewer
          reading a one-way stream.
        </li>
        <li>
          <span className="text-ink">The buffer holds about an hour</span> of simulated time. Past that,
          the oldest ticks drop off the front.
        </li>
      </ul>
    </Panel>
  )
}

function Count({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-control bg-inset px-3 py-2">
      <div className="text-[12px] text-ink-mute">{label}</div>
      <div className="num mt-0.5 text-[17px] text-ink-strong">{value}</div>
      <div className="text-[12px] text-ink-mute">{sub}</div>
    </div>
  )
}
