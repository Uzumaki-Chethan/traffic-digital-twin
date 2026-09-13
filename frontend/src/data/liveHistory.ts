import { create } from 'zustand'
import { LANE_IDS, isLive, type Snapshot } from './types'

/**
 * A rolling history of the run that is happening right now, built in the
 * browser from the live WebSocket stream.
 *
 * Why this exists: the Analytics page used to read the SQLite database
 * through the history endpoints, which meant two problems at once. It
 * mixed every run ever recorded into one average (simulated time
 * restarts at zero each run, so "t = 120 s" is a different moment in
 * every one of them), and it died with the server when SUMO closed. The
 * page now shows THIS run, live, and nothing else — so it needs a place
 * to remember what it has already seen.
 *
 * The snapshot carries no history of its own, only the current instant,
 * so each distinct sim tick is appended here as one sample. The database
 * is still written by the backend exactly as before; it is simply no
 * longer what this page reads.
 *
 * Re-render control: at 5x or unthrottled speed the stream can deliver
 * dozens of ticks a second, and re-deriving ten charts that often would
 * lock the page up. Samples are therefore always appended, but
 * `revision` (what components subscribe to) is bumped at most once a
 * second, so the charts refresh at a readable cadence without losing any
 * data.
 */

export interface LiveSample {
  /** Simulated seconds since this run started. */
  t: number
  vehicles: number
  speed: number
  wait: number
  stopped: number
  /** Mean of the 12 per-lane urgency scores — the network congestion index. */
  congestion: number
  phase: string
  mode: string
  /** Sim seconds the active phase has been held at this tick. */
  duration: number
  /** Per-lane, in LANE_IDS order. */
  laneScore: number[]
  laneVeh: number[]
  laneWait: number[]
}

/** ~1 hour of simulated time at the 1 Hz publish cadence. */
const CAPACITY = 3600
const REFRESH_MS = 1000

let samples: LiveSample[] = []
let lastT: number | null = null
let lastBump = 0

interface HistoryState {
  /** Bumped when the charts should re-derive. */
  revision: number
  /** Sample count — drives the "start the simulation" gate. */
  count: number
  /** Earliest and latest simulated time held. */
  from: number
  to: number
  cleared: number
  /**
   * Mean absolute error of the ML predictor over this run, in vehicles,
   * across every matured predicted-vs-actual pair. Accumulated here
   * rather than in the panel that shows it because it is run-scoped
   * state that has to survive the panel unmounting (switching pages) and
   * reset when a new run starts — exactly what this store already does.
   */
  predMae: number | null
  /** How many lane-level pairs that average is over. */
  predPairs: number
}

export const useLiveHistory = create<HistoryState>(() => ({
  revision: 0,
  count: 0,
  from: 0,
  to: 0,
  cleared: 0,
  predMae: null,
  predPairs: 0,
}))

/** Running |predicted - actual| total for this run, and the pair it last counted. */
let predError = 0
let predPairs = 0
let lastPredictionAt: number | null = null

/** The buffer itself. Read inside a useMemo keyed on `revision`. */
export function getSamples(): readonly LiveSample[] {
  return samples
}

export function clearLiveHistory(): void {
  samples = []
  lastT = null
  lastBump = 0
  predError = 0
  predPairs = 0
  lastPredictionAt = null
  useLiveHistory.setState((s) => ({
    revision: s.revision + 1,
    count: 0,
    from: 0,
    to: 0,
    cleared: s.cleared + 1,
    predMae: null,
    predPairs: 0,
  }))
}

function publish(force: boolean): void {
  const now = performance.now()
  if (!force && now - lastBump < REFRESH_MS) return
  lastBump = now
  useLiveHistory.setState((s) => ({
    revision: s.revision + 1,
    count: samples.length,
    from: samples.length > 0 ? samples[0].t : 0,
    to: samples.length > 0 ? samples[samples.length - 1].t : 0,
    predMae: predPairs === 0 ? null : predError / predPairs,
    predPairs,
  }))
}

/**
 * Append one snapshot, if it is a tick we have not already recorded.
 *
 * Frames arrive at 2 Hz but sim_time only changes at 1 Hz, so identical
 * ticks are skipped. Simulated time running BACKWARDS means a new run
 * started (it always restarts at zero), which clears the buffer — the
 * alternative is silently splicing two different runs into one chart.
 */
export function pushLiveSample(snapshot: Snapshot): void {
  if (!isLive(snapshot)) return
  const t = snapshot.sim_time
  if (lastT !== null && t === lastT) return
  if (lastT !== null && t < lastT) {
    clearLiveHistory()
  }

  // Each matured prediction is counted exactly once: the backend keeps
  // re-sending the most recent evaluated pair every tick until a newer
  // one matures, and target_time is what makes them distinguishable.
  const prediction = snapshot.prediction
  if (prediction && prediction.target_time !== lastPredictionAt) {
    lastPredictionAt = prediction.target_time
    for (const row of prediction.rows) {
      predError += Math.abs(row.pred_veh - row.act_veh)
      predPairs += 1
    }
  }

  const byId = new Map(snapshot.lanes.map((l) => [l.lane_id, l]))
  const laneScore: number[] = []
  const laneVeh: number[] = []
  const laneWait: number[] = []
  let scoreTotal = 0
  for (const id of LANE_IDS) {
    const lane = byId.get(id)
    // `score` was added to the snapshot alongside this page; a backend
    // that predates it simply has no lane pressure to plot.
    const score = lane?.score ?? 0
    laneScore.push(score)
    laneVeh.push(lane?.vehicles ?? 0)
    laneWait.push(lane?.avg_wait ?? 0)
    scoreTotal += score
  }

  samples.push({
    t,
    vehicles: snapshot.metrics.vehicles,
    speed: snapshot.metrics.avg_speed,
    wait: snapshot.metrics.avg_wait,
    stopped: snapshot.metrics.stopped,
    congestion: scoreTotal / LANE_IDS.length,
    phase: snapshot.decision.active_phase,
    mode: snapshot.decision.mode,
    duration: snapshot.decision.duration,
    laneScore,
    laneVeh,
    laneWait,
  })
  if (samples.length > CAPACITY) samples = samples.slice(-CAPACITY)
  lastT = t

  // First sample shows immediately; after that, at the readable cadence.
  publish(samples.length <= 1)
}
