import type { Snapshot, VehicleView } from './types'
import { isEvaluation, isLive } from './types'

/**
 * Vehicle motion between frames, for both views.
 *
 * Frames arrive every 0.2 simulated seconds (motion frames) with jitter
 * of tens of milliseconds in wall time — the server's poll, pacing, the
 * decision tick's own cost. Tweening TOWARD each frame as it lands
 * sized the tween to the average interval, so every longer gap left the
 * car standing at its mark for the difference: the hitch every few
 * seconds. This buffer does what a video player does instead: it keeps
 * the last few frames and the views draw the traffic a fixed lag BEHIND
 * the newest frame, interpolating between the two frames that bracket
 * the display time. Jitter smaller than the lag cannot show, and the
 * motion is one continuous curve through every received position.
 *
 * Heading is SUMO's own (`angle`, degrees clockwise from north, along
 * the lane's real shape), interpolated the short way round — nothing is
 * derived from position deltas any more, so a turn is a turn.
 *
 * One buffer per side: the demo run, and the evaluation's `ai` and
 * `baseline` fleets. Fed from useSocket at ingest; `reset()` on a new
 * run (store.reset). Module-level and imperative on purpose: the views
 * sample it from a requestAnimationFrame loop and write transforms to
 * the DOM / three.js directly, so nothing re-renders per frame.
 */

export type MotionSide = 'demo' | 'ai' | 'baseline'

export interface Pose {
  id: string
  type?: string
  lane: string
  /** SUMO metres (x east, y north). */
  x: number
  y: number
  /** Degrees clockwise from north, SUMO's convention. */
  angle: number
  speed: number
}

interface Frame {
  t: number
  byId: Map<string, VehicleView>
}

/** Display lag behind the newest frame, wall seconds. Two motion frames
 * at 1x; the jitter measured on the wire was ±50 ms. */
export const LAG_WALL_SECONDS = 0.25
const KEEP_FRAMES = 12

/**
 * SUMO performs a lane change as an instantaneous sideways jump of one
 * lane between two steps. Drawn as it comes, a car slides 3.2 m across
 * in one frame interval. The views spread the sideways part of that
 * move over this many simulated seconds instead — a gentle drift with a
 * slight yaw, as a real lane change looks — while the along-road motion
 * stays exact. Cosmetic only: the simulation is untouched, and the car
 * is where SUMO put it once the drift is done.
 */
export const LANE_CHANGE_SECONDS = 1.2
const LANE_CHANGE_YAW_DEG = 6

interface LaneChange {
  /** Simulated time of the frame BEFORE the jump was seen. */
  t: number
  /** The sideways jump, SUMO metres: subtracted (fading) from the drawn position. */
  dx: number
  dy: number
  /** Which way the car drifts relative to its heading: +1 right, -1 left. */
  side: 1 | -1
}

/** "S_out" for "S_out_1"; null for an internal lane. */
function roadOf(lane: string): string | null {
  if (lane.startsWith(':')) return null
  const i = lane.lastIndexOf('_')
  return i > 0 ? lane.slice(0, i) : null
}

function smoothstep(f: number): number {
  const x = Math.max(0, Math.min(1, f))
  return x * x * (3 - 2 * x)
}

/** Signed smallest rotation from a to b, degrees. */
export function shortestTurn(a: number, b: number): number {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

export class MotionBuffer {
  private frames: Frame[] = []
  private laneChanges = new Map<string, LaneChange>()
  /** Bumped on every push and reset, so a view can tell new data cheaply. */
  version = 0

  push(t: number, vehicles: VehicleView[] | undefined): void {
    if (!vehicles) return
    const last = this.frames[this.frames.length - 1]
    if (last && t < last.t) {
      // Time ran backwards: a new run.
      this.frames = []
      this.laneChanges.clear()
    }
    if (last && t === last.t) return
    const frame: Frame = { t, byId: new Map(vehicles.map((v) => [v.id, v])) }
    const prev = this.frames[this.frames.length - 1]
    if (prev) this.noteLaneChanges(prev, frame)
    this.frames.push(frame)
    if (this.frames.length > KEEP_FRAMES) this.frames.shift()
    this.version++
  }

  /** A vehicle on a different lane of the SAME road than last frame jumped sideways. */
  private noteLaneChanges(prev: Frame, next: Frame): void {
    for (const vb of next.byId.values()) {
      const va = prev.byId.get(vb.id)
      if (!va || va.lane === vb.lane) continue
      const road = roadOf(vb.lane)
      if (road === null || road !== roadOf(va.lane)) continue
      // Split the move into along-heading and sideways parts.
      const a = ((vb.angle ?? 0) * Math.PI) / 180
      const hx = Math.sin(a)
      const hy = Math.cos(a)
      const jx = vb.x - va.x
      const jy = vb.y - va.y
      const along = jx * hx + jy * hy
      const dx = jx - hx * along
      const dy = jy - hy * along
      if (dx * dx + dy * dy < 1.5 * 1.5) continue // not a whole lane: noise, or a merge
      // Right of the heading is the clockwise side: cross(h, lateral) < 0.
      const side: 1 | -1 = hx * dy - hy * dx < 0 ? 1 : -1
      this.laneChanges.set(vb.id, { t: prev.t, dx, dy, side })
    }
    // Forget changes that have played out, and vehicles that have left.
    for (const [id, lc] of this.laneChanges) {
      if (next.t - lc.t > LANE_CHANGE_SECONDS + 1 || !next.byId.has(id)) this.laneChanges.delete(id)
    }
  }

  /** Ease a lane change: pull the drawn pose back toward the old lane, fading over LANE_CHANGE_SECONDS. */
  private easeLaneChange(p: Pose, tau: number): void {
    const lc = this.laneChanges.get(p.id)
    if (!lc || tau < lc.t) return
    const f = (tau - lc.t) / LANE_CHANGE_SECONDS
    if (f >= 1) return
    const remaining = 1 - smoothstep(f)
    p.x -= lc.dx * remaining
    p.y -= lc.dy * remaining
    // A touch of yaw toward the new lane, strongest mid-change.
    p.angle += lc.side * LANE_CHANGE_YAW_DEG * Math.sin(Math.PI * f)
  }

  reset(): void {
    this.frames = []
    this.laneChanges.clear()
    this.version++
  }

  get latestT(): number | null {
    return this.frames.length ? this.frames[this.frames.length - 1].t : null
  }

  get oldestT(): number | null {
    return this.frames.length ? this.frames[0].t : null
  }

  /** The type a vehicle was last seen with, for building its element. */
  typeOf(id: string): string | undefined {
    for (let k = this.frames.length - 1; k >= 0; k--) {
      const v = this.frames[k].byId.get(id)
      if (v) return v.type
    }
    return undefined
  }

  /** Every vehicle in the newest two frames — the set a view must have elements for. */
  ids(): string[] {
    const n = this.frames.length
    if (n === 0) return []
    const ids = new Set<string>(this.frames[n - 1].byId.keys())
    if (n > 1) for (const id of this.frames[n - 2].byId.keys()) ids.add(id)
    return [...ids]
  }

  /**
   * Poses at simulated time `tau`. Between two frames a vehicle present
   * in both is interpolated; one present only in the later frame has
   * just appeared and sits at its first position; one present only in
   * the earlier frame is gone once tau passes that frame. Past the
   * newest frame, the newest poses as they are (no extrapolation — it
   * is what put cars on the verge).
   */
  sample(tau: number, out: Map<string, Pose>): void {
    out.clear()
    const n = this.frames.length
    if (n === 0) return
    let k = n - 1
    while (k > 0 && this.frames[k].t > tau) k--
    const a = this.frames[k]
    const b = k + 1 < n ? this.frames[k + 1] : null
    if (!b || tau <= a.t) {
      for (const v of a.byId.values()) {
        const p = poseOf(v)
        this.easeLaneChange(p, tau)
        out.set(v.id, p)
      }
      return
    }
    const f = Math.max(0, Math.min(1, (tau - a.t) / (b.t - a.t)))
    for (const vb of b.byId.values()) {
      const va = a.byId.get(vb.id)
      if (!va) {
        out.set(vb.id, poseOf(vb))
        continue
      }
      const aa = va.angle ?? 0
      const p: Pose = {
        id: vb.id,
        type: vb.type,
        lane: f < 0.5 ? va.lane : vb.lane,
        x: va.x + (vb.x - va.x) * f,
        y: va.y + (vb.y - va.y) * f,
        angle: aa + shortestTurn(aa, vb.angle ?? 0) * f,
        speed: va.speed + (vb.speed - va.speed) * f,
      }
      this.easeLaneChange(p, tau)
      out.set(vb.id, p)
    }
  }
}

function poseOf(v: VehicleView): Pose {
  return { id: v.id, type: v.type, lane: v.lane, x: v.x, y: v.y, angle: v.angle ?? 0, speed: v.speed }
}

const buffers: Record<MotionSide, MotionBuffer> = {
  demo: new MotionBuffer(),
  ai: new MotionBuffer(),
  baseline: new MotionBuffer(),
}

export function motionBuffer(side: MotionSide): MotionBuffer {
  return buffers[side]
}

/** Feed every frame's fleets into their buffers (useSocket). */
export function pushMotion(snapshot: Snapshot): void {
  if (isLive(snapshot)) buffers.demo.push(snapshot.sim_time, snapshot.vehicles)
  else if (isEvaluation(snapshot)) {
    buffers.ai.push(snapshot.sim_time, snapshot.ai.vehicles)
    buffers.baseline.push(snapshot.sim_time, snapshot.baseline.vehicles)
  }
}

export function resetMotion(): void {
  for (const b of Object.values(buffers)) b.reset()
}

/**
 * The display clock a view runs: simulated time to draw, advancing at
 * the measured sim rate and held LAG_WALL_SECONDS behind the newest
 * frame. Call `advance` once per animation frame.
 */
export class DisplayClock {
  private tau: number | null = null
  private lastNow = 0

  reset(): void {
    this.tau = null
  }

  advance(now: number, buffer: MotionBuffer, rate: number | null, smooth: boolean): number | null {
    const latest = buffer.latestT
    if (latest === null) {
      this.tau = null
      return null
    }
    // Without a tween (frames too far apart in sim time) draw the newest.
    if (!smooth) {
      this.tau = latest
      this.lastNow = now
      return latest
    }
    const r = rate ?? 1
    const target = latest - LAG_WALL_SECONDS * r
    const dt = this.lastNow ? Math.min(0.25, (now - this.lastNow) / 1000) : 0
    this.lastNow = now
    if (this.tau === null) {
      this.tau = target
    } else {
      // Run at the sim rate, and lean gently toward the target so
      // drift is corrected without a visible speed change.
      this.tau += dt * r
      const err = target - this.tau
      // Fallen far behind (tab hidden, a stall): jump. Otherwise ease.
      if (Math.abs(err) > 2 * LAG_WALL_SECONDS * r + 0.5) this.tau = target
      else this.tau += err * Math.min(1, dt * 2)
    }
    const oldest = buffer.oldestT ?? latest
    if (this.tau > latest) this.tau = latest
    if (this.tau < oldest) this.tau = oldest
    return this.tau
  }
}
