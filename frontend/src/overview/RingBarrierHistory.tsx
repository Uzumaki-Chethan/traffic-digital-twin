import { useMemo } from 'react'
import clsx from 'clsx'
import type { PhaseHistoryEntry } from '@/data/types'
import { Panel } from '@/ui/Panel'
import { phaseAxis } from '@/utils/signal'

interface Segment {
  phase: string
  yellow: boolean
  start: number
  end: number
}

const SHORT: Record<string, string> = {
  NS_straight_left: 'straight + left',
  NS_right: 'right',
  EW_straight_left: 'straight + left',
  EW_right: 'right',
}

/** Collapse the per-tick history into runs of (phase, is_yellow). */
function segments(history: PhaseHistoryEntry[]): { segs: Segment[]; t0: number; t1: number } {
  if (history.length === 0) return { segs: [], t0: 0, t1: 1 }
  const segs: Segment[] = []
  for (let i = 0; i < history.length; i++) {
    const e = history[i]
    const last = segs[segs.length - 1]
    const next = history[i + 1]
    const end = next ? next.time : e.time + 1
    if (last && last.phase === e.phase && last.yellow === e.is_yellow) {
      last.end = end
    } else {
      segs.push({ phase: e.phase, yellow: e.is_yellow, start: e.time, end })
    }
  }
  return { segs, t0: history[0].time, t1: segs[segs.length - 1].end }
}

/**
 * The two rings of the junction as two tracks over one time axis, like a
 * ring-barrier diagram: a track is green while its axis holds the phase,
 * amber during clearance, and quiet while the other ring runs. This is
 * a time–space diagram in miniature; it shows the controller's rhythm
 * honestly, including when it switches often.
 */
export function RingBarrierHistory({ history }: { history: PhaseHistoryEntry[] }) {
  const { segs, t0, t1 } = useMemo(() => segments(history), [history])
  const span = Math.max(1, t1 - t0)

  if (history.length === 0) {
    return (
      <Panel title="Phase history" meta="ring-barrier">
        <div className="py-3 text-[13px] text-ink-mute">No phase history yet.</div>
      </Panel>
    )
  }

  const ticks = 6
  return (
    <Panel title="Phase history" meta={`last ${Math.round(span)} s`} bodyClassName="p-2">
      <Track label="Ring 1 · N–S" axis="NS" segs={segs} span={span} />
      <Track label="Ring 2 · E–W" axis="EW" segs={segs} span={span} />
      <div className="ml-24 mt-1 flex justify-between text-[12px] text-ink-mute">
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const secondsAgo = Math.round(span - (span * i) / ticks)
          return (
            <span key={i} className="num">
              {i === ticks ? 'now' : `−${secondsAgo}s`}
            </span>
          )
        })}
      </div>
    </Panel>
  )
}

function Track({ label, axis, segs, span }: { label: string; axis: 'NS' | 'EW'; segs: Segment[]; span: number }) {
  return (
    <div className="mb-1 flex h-7 items-center gap-2">
      <div className="w-[88px] shrink-0 text-[12px] font-medium text-ink-mute">{label}</div>
      <div className="flex h-full flex-1 overflow-hidden rounded-control bg-inset">
        {segs.map((s, i) => {
          const w = ((s.end - s.start) / span) * 100
          const mine = phaseAxis(s.phase) === axis
          const last = i === segs.length - 1
          return (
            <div
              key={i}
              title={`${s.phase}${s.yellow ? ' (clearance)' : ''} · ${(s.end - s.start).toFixed(0)} s`}
              className={clsx(
                'flex h-full items-center overflow-hidden whitespace-nowrap border-r border-rule-soft px-1.5 text-[12px]',
                mine && !s.yellow && 'bg-signal-green text-white',
                mine && s.yellow && 'bg-signal-amber text-ink-strong',
                !mine && 'text-ink-mute',
                last && mine && !s.yellow && 'ring-1 ring-inset ring-ink-strong',
              )}
              style={{ width: `${w}%`, transition: 'width var(--dur-value) var(--ease-out)' }}
            >
              {mine && !s.yellow && w > 8 && (
                <span className="truncate">
                  {SHORT[s.phase] ?? s.phase}
                  <span className="num ml-1 opacity-80">{(s.end - s.start).toFixed(0)}s</span>
                </span>
              )}
              {!mine && w > 10 && <span className="truncate">hold</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
