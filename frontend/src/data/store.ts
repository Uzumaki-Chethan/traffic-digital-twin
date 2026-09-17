import { create } from 'zustand'
import type { LiveSnapshot, Snapshot } from './types'
import { isEvaluation, isLive } from './types'
import { resetMotion } from './motion'

export type LinkState = 'connecting' | 'open' | 'closed'

interface SimState {
  link: LinkState
  latest: Snapshot | null
  /** performance.now() when `latest` arrived — drives staleness. */
  receivedAt: number
  /** Last live snapshot, kept through a link drop so the screen never blanks. */
  lastLive: LiveSnapshot | null
  /**
   * Measured simulation speed: simulated seconds per wall-clock second,
   * from the last two frames in which sim_time actually changed (frames
   * are re-sent at 2 Hz even when the sim hasn't ticked). Smoothed.
   * null until two distinct ticks have been seen. This is what makes
   * the on-screen clocks coherent whatever delay sumo-gui is running at.
   */
  rate: number | null
  /** sim_time and wall time of the last frame where sim_time changed. */
  tickSim: number
  tickAt: number
  /**
   * Wall milliseconds between the last two real sim ticks. Vehicle
   * positions only arrive once per tick, so anything animating them has
   * to stretch the move across exactly this long — otherwise it jumps
   * and then sits still, which is what "laggy, frame by frame" looks
   * like. Clamped to keep a stalled sim from producing an absurd value.
   */
  tickInterval: number
  /**
   * Simulated seconds between the last two frames whose sim_time moved.
   * The server sends a frame per simulation tick (1 s) at any speed, so
   * this is normally ~1 and the tween between frames stays on the road.
   * `smooth` is the safety net for a slow link or an old server that
   * still batches at 2 Hz wall time: past SMOOTH_MAX_SIM_SECONDS per
   * frame a straight tween is a chord across the junction — through the
   * verge — so the views then draw every frame where SUMO put the
   * vehicle and skip the tween.
   */
  simPerFrame: number
  smooth: boolean
  /** Lane under the pointer, on the plate or in the table — cross-highlight. */
  hoverLane: string | null
  setLink: (l: LinkState) => void
  ingest: (s: Snapshot) => void
  setHoverLane: (id: string | null) => void
  /** A new run started: forget the old run's frames and clocks. */
  reset: () => void
}

/** Longest simulated span a frame may cover and still be tweened. */
export const SMOOTH_MAX_SIM_SECONDS = 1.6

const FRESH = {
  latest: null,
  receivedAt: 0,
  lastLive: null,
  rate: null,
  tickSim: 0,
  tickAt: 0,
  tickInterval: 1000,
  simPerFrame: 1,
  smooth: true,
} as const

export const useSim = create<SimState>((set) => ({
  link: 'connecting',
  ...FRESH,
  hoverLane: null,
  setLink: (link) => set({ link }),
  setHoverLane: (hoverLane) => set({ hoverLane }),
  reset: () => {
    resetMotion()
    set({ ...FRESH })
  },
  ingest: (snapshot) =>
    set((prev) => {
      const now = performance.now()
      // Both a demo frame and an evaluation frame carry sim_time and
      // tick once a second; the clock, the measured rate and the plate's
      // interpolation window need all of them. Only a demo frame becomes
      // lastLive - that is Overview's "keep the last picture" fallback.
      const ticking = isLive(snapshot) || isEvaluation(snapshot)
      if (!ticking) return { latest: snapshot, receivedAt: now }

      let { rate, tickSim, tickAt, tickInterval, simPerFrame } = prev
      if (snapshot.sim_time !== tickSim) {
        const dWallMs = now - tickAt
        const dWall = dWallMs / 1000
        const dSim = snapshot.sim_time - tickSim
        // Frames can arrive 30 times a second at "max" speed, so the
        // floor is one display frame, not the old 120 ms.
        if (tickAt > 0 && dWall > 0.01 && dSim > 0 && dSim < 60) {
          const r = dSim / dWall
          rate = rate == null ? r : rate * 0.7 + r * 0.3
          // Smoothed, and clamped to a sane animation window.
          tickInterval = Math.max(33, Math.min(2000, tickInterval * 0.6 + dWallMs * 0.4))
          simPerFrame = simPerFrame * 0.5 + dSim * 0.5
        }
        tickSim = snapshot.sim_time
        tickAt = now
      }
      return {
        latest: snapshot, receivedAt: now, rate, tickSim, tickAt, tickInterval, simPerFrame,
        smooth: simPerFrame <= SMOOTH_MAX_SIM_SECONDS,
        lastLive: isLive(snapshot) ? snapshot : prev.lastLive,
      }
    }),
}))
