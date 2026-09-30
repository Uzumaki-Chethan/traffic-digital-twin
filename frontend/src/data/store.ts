import { create } from 'zustand'
import type { LiveSnapshot, Snapshot } from './types'
import { isEvaluation, isLive } from './types'
import { resetMotion } from './motion'

export type LinkState = 'connecting' | 'open' | 'closed'

interface SimState {
  link: LinkState
  latest: Snapshot | null
  /**
   * The newest frame that is NOT a motion frame — a decision tick, or any
   * non-running frame. Motion frames (tick: false, up to 30/s) repeat the
   * last tick with only vehicle positions and the clock moved; the vehicle
   * layers and useLiveClock read those directly, so the page panels follow
   * this instead and re-render per tick, not per motion frame
   * (Section 37.6).
   */
  latestTick: Snapshot | null
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

/**
 * The sim rate over a WINDOW of recent frames (sim seconds / wall seconds
 * across the last ~2 s), not frame-to-frame. Two frames arriving close
 * together — which a busy machine or the network does all the time — made
 * the old per-pair estimate spike (x2.9, x7 at 1x); the vehicle clock
 * runs at this rate, so a spike raced the cars into the newest frame
 * where they stopped and waited: "moves, stops, moves" (Section 37.10).
 */
const RATE_WINDOW_MS = 2000
let rateSamples: { wall: number; sim: number }[] = []
function windowRate(wall: number, sim: number): number | null {
  const last = rateSamples[rateSamples.length - 1]
  if (last && sim < last.sim) rateSamples = [] // time ran backwards: a new run
  rateSamples.push({ wall, sim })
  while (rateSamples.length > 2 && wall - rateSamples[0].wall > RATE_WINDOW_MS) rateSamples.shift()
  const first = rateSamples[0]
  const dWall = (wall - first.wall) / 1000
  if (dWall < 0.5) return null
  return (sim - first.sim) / dWall
}

const FRESH = {
  latest: null,
  latestTick: null,
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
    rateSamples = []
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
      const motion = (snapshot as { tick?: boolean }).tick === false
      if (!ticking) return { latest: snapshot, latestTick: snapshot, receivedAt: now }

      let { rate, tickSim, tickAt, tickInterval, simPerFrame } = prev
      if (snapshot.sim_time !== tickSim) {
        const dWallMs = now - tickAt
        const dWall = dWallMs / 1000
        const dSim = snapshot.sim_time - tickSim
        // Frames can arrive 30 times a second at "max" speed, so the
        // floor is one display frame, not the old 120 ms.
        const windowed = windowRate(now, snapshot.sim_time)
        if (tickAt > 0 && dWall > 0.01 && dSim > 0 && dSim < 60) {
          const r = windowed ?? dSim / dWall
          // Lightly smoothed on top of the window, so the readout and the
          // vehicle clock drift rather than step when the speed changes.
          rate = rate == null ? r : rate * 0.6 + r * 0.4
          // Smoothed, and clamped to a sane animation window.
          tickInterval = Math.max(33, Math.min(2000, tickInterval * 0.6 + dWallMs * 0.4))
          simPerFrame = simPerFrame * 0.5 + dSim * 0.5
        }
        tickSim = snapshot.sim_time
        tickAt = now
      }
      return {
        // A motion frame only stands in when there is no tick yet — e.g. a
        // page opened while the run is paused, when no ticks arrive.
        latest: snapshot, latestTick: motion && prev.latestTick ? prev.latestTick : snapshot,
        receivedAt: now, rate, tickSim, tickAt, tickInterval, simPerFrame,
        smooth: simPerFrame <= SMOOTH_MAX_SIM_SECONDS,
        lastLive: isLive(snapshot) && (!motion || !prev.lastLive) ? snapshot : prev.lastLive,
      }
    }),
}))
