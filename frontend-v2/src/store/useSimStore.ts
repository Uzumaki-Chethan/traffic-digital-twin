import { create } from 'zustand'
import type { LiveSnapshot, Snapshot } from '@/types/snapshot'
import { isLive } from '@/types/snapshot'

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

/**
 * The backend publishes one instantaneous snapshot per decision tick -
 * it does not keep its own long-running time series in memory (only the
 * last 60 phase_history entries). Charts that need a trend (waiting time
 * over time, queue over time) accumulate their own rolling buffer here as
 * snapshots arrive, capped so a long-running demo can't grow this
 * unbounded.
 */
const MAX_TREND_POINTS = 300

export interface TrendPoint {
  t: number
  avg_wait: number
  avg_speed: number
  queue: number
  vehicles: number
}

interface SimState {
  status: ConnectionStatus
  latest: Snapshot | null
  trend: TrendPoint[]
  setStatus: (s: ConnectionStatus) => void
  ingest: (snapshot: Snapshot) => void
  reset: () => void
}

export const useSimStore = create<SimState>((set, get) => ({
  status: 'connecting',
  latest: null,
  trend: [],
  setStatus: (status) => set({ status }),
  ingest: (snapshot) => {
    const trend = get().trend
    if (isLive(snapshot as Snapshot)) {
      const live = snapshot as LiveSnapshot
      const last = trend[trend.length - 1]
      // Snapshots arrive every 0.5s but the underlying data only changes
      // once per decision tick (~1s); skip duplicate ticks so the trend
      // buffer represents real samples, not a repeated flat segment.
      if (!last || last.t !== live.sim_time) {
        const next: TrendPoint = {
          t: live.sim_time,
          avg_wait: live.metrics.avg_wait,
          avg_speed: live.metrics.avg_speed,
          queue: live.metrics.queue,
          vehicles: live.metrics.vehicles,
        }
        const nextTrend = [...trend, next]
        if (nextTrend.length > MAX_TREND_POINTS) nextTrend.shift()
        set({ latest: snapshot, trend: nextTrend })
        return
      }
    }
    set({ latest: snapshot })
  },
  reset: () => set({ latest: null, trend: [] }),
}))
