import { useEffect, useRef, type MutableRefObject } from 'react'
import { useSim } from '@/data/store'
import { useRunStore } from '@/data/runState'
import { usePageContext } from '@/data/pageContext'
import { isLive } from '@/data/types'
import { lampOf, phaseLabel } from '@/utils/signal'
import { MAX_GREEN, MIN_GREEN } from '@/utils/phaseWindows'
import { EMPTY_FACTS, type LiveFacts } from './catalogue'
import type { RunFacts } from './types'

export interface LiveState {
  run: RunFacts
  scenario: string
  /** Bumped once per decision tick whose decision switched. */
  switchedSeq: number
  emergency: boolean
  queued: number
  facts: LiveFacts
}

/**
 * Everything Blinky knows about the run, kept in a ref by store
 * subscriptions (no re-render). Strictly read-only.
 */
export function useLiveState(): MutableRefObject<LiveState> {
  const ref = useRef<LiveState>({
    run: { running: false, paused: false, speed: 1, kind: null },
    scenario: '',
    switchedSeq: 0,
    emergency: false,
    queued: 0,
    facts: EMPTY_FACTS,
  })
  const { scenario } = usePageContext()
  useEffect(() => {
    ref.current.scenario = scenario
  }, [scenario])

  useEffect(() => {
    const readRun = () => {
      const r = useRunStore.getState().state
      ref.current.run = {
        running: r?.running === true,
        paused: r?.paused === true,
        speed: r?.available ? r.speed : 1,
        kind: r?.kind ?? null,
      }
    }
    readRun()
    const offRun = useRunStore.subscribe(readRun)
    let lastT = -1
    const offSim = useSim.subscribe((s) => {
      const snap = s.latestTick
      if (!isLive(snap)) {
        ref.current.facts = EMPTY_FACTS
        ref.current.emergency = false
        return
      }
      if (snap.sim_time !== lastT) {
        lastT = snap.sim_time
        if (snap.decision.switched) ref.current.switchedSeq++
      }
      const d = snap.decision
      ref.current.emergency = snap.emergency_lanes.length > 0
      ref.current.queued = snap.metrics.stopped
      ref.current.facts = {
        running: ref.current.run.running,
        vehicles: snap.metrics.vehicles,
        greens: snap.lanes.filter((l) => lampOf(l.signal) === 'green').length,
        phase: phaseLabel(d.active_phase),
        held: Math.round(d.duration),
        min: MIN_GREEN[d.active_phase] ?? null,
        max: MAX_GREEN[d.active_phase] ?? null,
      }
    })
    return () => {
      offRun()
      offSim()
    }
  }, [])
  return ref
}
