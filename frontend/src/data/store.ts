import { create } from 'zustand'
import type { LiveSnapshot, Snapshot } from './types'
import { isLive } from './types'

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
  /** Lane under the pointer, on the plate or in the table — cross-highlight. */
  hoverLane: string | null
  setLink: (l: LinkState) => void
  ingest: (s: Snapshot) => void
  setHoverLane: (id: string | null) => void
}

export const useSim = create<SimState>((set) => ({
  link: 'connecting',
  latest: null,
  receivedAt: 0,
  lastLive: null,
  rate: null,
  tickSim: 0,
  tickAt: 0,
  tickInterval: 1000,
  hoverLane: null,
  setLink: (link) => set({ link }),
  setHoverLane: (hoverLane) => set({ hoverLane }),
  ingest: (snapshot) =>
    set((prev) => {
      const now = performance.now()
      if (!isLive(snapshot)) return { latest: snapshot, receivedAt: now }

      let { rate, tickSim, tickAt, tickInterval } = prev
      if (snapshot.sim_time !== tickSim) {
        const dWallMs = now - tickAt
        const dWall = dWallMs / 1000
        const dSim = snapshot.sim_time - tickSim
        if (tickAt > 0 && dWall > 0.05 && dSim > 0 && dSim < 60) {
          const r = dSim / dWall
          rate = rate == null ? r : rate * 0.7 + r * 0.3
          // Smoothed, and clamped to a sane animation window.
          tickInterval = Math.max(120, Math.min(2000, tickInterval * 0.6 + dWallMs * 0.4))
        }
        tickSim = snapshot.sim_time
        tickAt = now
      }
      return { latest: snapshot, receivedAt: now, lastLive: snapshot, rate, tickSim, tickAt, tickInterval }
    }),
}))
