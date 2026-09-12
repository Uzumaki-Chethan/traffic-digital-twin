import { useEffect, useState } from 'react'
import { useSim } from './store'
import { isLive } from './types'

/**
 * Frames arrive at 2 Hz but the clocks move continuously, and the sim may
 * run faster or slower than wall time depending on sumo-gui's delay
 * setting. This advances every clock at the MEASURED sim rate since the
 * last real tick, and re-syncs on each arrival, so the numbers read
 * smoothly and stay coherent with what SUMO is doing.
 *
 * What each clock means (verified against the backend):
 *   simTime      sim_time, extrapolated forward at the measured rate
 *   heldSeconds  decision.duration — sim seconds the current phase has
 *                been held (resets on a switch), extrapolated the same way
 *   clearance    signal.countdown, ONLY meaningful while is_yellow: sim
 *                seconds of amber remaining. During green the backend
 *                re-arms SUMO's next-switch to a 60 s provisional ceiling
 *                every tick, so it is not a real countdown then.
 *   staleSeconds wall seconds since the last frame of any kind
 *   tickAge      wall seconds since sim_time last changed — a live link
 *                with a growing tickAge means SUMO is paused
 *   rate         measured sim seconds per wall second (null until known)
 */
export function useLiveClock() {
  const latest = useSim((s) => s.latest)
  const receivedAt = useSim((s) => s.receivedAt)
  const rate = useSim((s) => s.rate)
  const tickAt = useSim((s) => s.tickAt)
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    let raf = 0
    const tick = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const live = isLive(latest) ? latest : null
  const staleSeconds = receivedAt ? Math.max(0, (now - receivedAt) / 1000) : 0
  // Wall seconds since the sim last ticked, capped so a stalled sim never
  // runs the clocks ahead of reality.
  const sinceTick = tickAt ? Math.min(1.5, Math.max(0, (now - tickAt) / 1000)) : 0
  const lead = rate == null ? 0 : sinceTick * rate

  return {
    staleSeconds,
    tickAge: tickAt ? Math.max(0, (now - tickAt) / 1000) : 0,
    rate,
    simTime: live ? live.sim_time + lead : null,
    heldSeconds: live ? live.decision.duration + lead : null,
    clearance: live?.signal?.is_yellow ? Math.max(0, live.signal.countdown - lead) : null,
  }
}
