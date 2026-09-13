import { LANE_IDS } from '@/data/types'
import type { LiveSample } from '@/data/liveHistory'

/**
 * Turns the live sample buffer into the shapes the charts already draw.
 *
 * The charts themselves did not change when Analytics moved from the
 * recorded database to the live stream — only where their rows come
 * from. Each function here produces exactly what the backend endpoint it
 * replaces produced, computed over THIS run instead of every run ever
 * recorded, which is the whole point: simulated time restarts at zero
 * each run, so a database-wide average at "t = 120 s" was an average
 * across twenty different moments.
 *
 * The prop types are deliberately structural and minimal (`phase`,
 * `duration`, ... not a full log row): the recorded `DecisionLogRow` /
 * `PerformanceLogRow` from api.ts still satisfy them, so nothing is
 * locked out of reading history later.
 */

export interface NetworkSample {
  time: number
  avg_wait: number
  avg_speed: number
  queue_length: number
}

export interface DecisionSample {
  time: number
  phase: string
  mode: string
  duration: number
}

export interface Bucket {
  bucket_start: number
  bucket_end: number
  avg_congestion_score: number
  sample_count: number
}

export interface LaneBucket extends Bucket {
  lane_id: string
}

export interface Peak {
  start_time: number
  end_time: number
  peak_congestion_score: number
  sample_count: number
}

/**
 * Bucket width for a run of this length, chosen so the time axis stays
 * readable as the run grows: about a dozen to two dozen columns, always.
 * A fixed 60 s (what the endpoints used) shows a single column for the
 * first minute of a live run and a hundred after an hour.
 */
const STEPS = [5, 10, 15, 20, 30, 60, 120, 300, 600]
const MAX_COLUMNS = 24

export function chooseBucket(spanSeconds: number): number {
  for (const step of STEPS) {
    if (spanSeconds / step <= MAX_COLUMNS) return step
  }
  return STEPS[STEPS.length - 1]
}

function bucketStart(t: number, width: number): number {
  return Math.floor(t / width) * width
}

/** Network congestion per time bucket — the congestion-trend endpoint. */
export function congestionBuckets(samples: readonly LiveSample[], width: number): Bucket[] {
  const totals = new Map<number, { sum: number; n: number }>()
  for (const s of samples) {
    const key = bucketStart(s.t, width)
    const entry = totals.get(key)
    if (entry) {
      entry.sum += s.congestion
      entry.n += 1
    } else {
      totals.set(key, { sum: s.congestion, n: 1 })
    }
  }
  return [...totals.entries()]
    .toSorted((a, b) => a[0] - b[0])
    .map(([start, { sum, n }]) => ({
      bucket_start: start,
      bucket_end: start + width,
      avg_congestion_score: sum / n,
      sample_count: n,
    }))
}

/** One row per (bucket, lane) — the same endpoint with group_by=lane. */
export function laneBuckets(samples: readonly LiveSample[], width: number): LaneBucket[] {
  const totals = new Map<string, { start: number; lane: string; sum: number; n: number }>()
  for (const s of samples) {
    const start = bucketStart(s.t, width)
    for (let i = 0; i < LANE_IDS.length; i++) {
      const key = `${start}|${i}`
      const entry = totals.get(key)
      if (entry) {
        entry.sum += s.laneScore[i]
        entry.n += 1
      } else {
        totals.set(key, { start, lane: LANE_IDS[i], sum: s.laneScore[i], n: 1 })
      }
    }
  }
  return [...totals.values()].map((e) => ({
    bucket_start: e.start,
    bucket_end: e.start + width,
    lane_id: e.lane,
    avg_congestion_score: e.sum / e.n,
    sample_count: e.n,
  }))
}

/**
 * Network samples for the time plots and the scatter, thinned to at most
 * `maxPoints` by even stride — an hour of ticks is 3600 points in a plot
 * 640 units wide, which costs SVG nodes and shows nothing extra. The
 * newest sample is always kept, so the line reaches the present.
 */
export function networkSamples(samples: readonly LiveSample[], maxPoints = 600): NetworkSample[] {
  const stride = Math.max(1, Math.ceil(samples.length / maxPoints))
  const out: NetworkSample[] = []
  for (let i = 0; i < samples.length; i += stride) out.push(toNetwork(samples[i]))
  const last = samples[samples.length - 1]
  if (last && (out.length === 0 || out[out.length - 1].time !== last.t)) out.push(toNetwork(last))
  return out
}

function toNetwork(s: LiveSample): NetworkSample {
  return { time: s.t, avg_wait: s.wait, avg_speed: s.speed, queue_length: s.stopped }
}

/**
 * One decision row per tick — the same cadence decision_log is written
 * at, so the phase/mode shares and the duration histogram read exactly
 * as they did from the database.
 */
export function decisionSamples(samples: readonly LiveSample[]): DecisionSample[] {
  return samples.map((s) => ({ time: s.t, phase: s.phase, mode: s.mode, duration: s.duration }))
}

/** Mean wait and sample count per lane — the wait-times endpoint. */
export function laneWaitMeans(samples: readonly LiveSample[]): Record<string, { average_wait_seconds: number; sample_count: number }> {
  const out: Record<string, { average_wait_seconds: number; sample_count: number }> = {}
  for (let i = 0; i < LANE_IDS.length; i++) {
    let sum = 0
    for (const s of samples) sum += s.laneWait[i]
    out[LANE_IDS[i]] = {
      average_wait_seconds: samples.length === 0 ? 0 : sum / samples.length,
      sample_count: samples.length,
    }
  }
  return out
}

export function networkWaitMean(samples: readonly LiveSample[]): number | null {
  if (samples.length === 0) return null
  let sum = 0
  for (const s of samples) sum += s.wait
  return sum / samples.length
}

/**
 * The busiest windows of this run, ranked by mean congestion and
 * reported in chronological order — the same statistical definition
 * backend/analytics/congestion_analytics.detect_peak_periods uses
 * (highest recorded congestion, not an assumed rush hour: simulated time
 * has no hour of day).
 */
export function peakWindows(samples: readonly LiveSample[], width: number, topN: number): Peak[] {
  const ranked = congestionBuckets(samples, width)
    .toSorted((a, b) => b.avg_congestion_score - a.avg_congestion_score)
    .slice(0, topN)
  return ranked
    .toSorted((a, b) => a.bucket_start - b.bucket_start)
    .map((b) => ({
      start_time: b.bucket_start,
      end_time: b.bucket_end,
      peak_congestion_score: b.avg_congestion_score,
      sample_count: b.sample_count,
    }))
}
