import { useSim } from './store'
import { useRunStore } from './runState'

/** How far the measured rate may stray from the set speed and still be
 * treated as noise rather than a sim that can't keep up. */
const AGREE = 0.15

/**
 * The rate the vehicle views' display clocks run at (data/motion
 * DisplayClock). The SET speed, when there is one and the measurement
 * agrees with it: RunControl paces the sim to exactly that multiple of
 * wall time (anchor-based, no drift), so it is the true rate — whereas the
 * measured one wobbles ~±10 % with frame timing, and the cars surged with
 * it ("like switching from 1x to 1.1x", owner, 2026-09-30; Section 37.13).
 * Falls back to the measurement on "max" (no set speed), when the sim
 * can't keep up with the set speed, or with no control layer attached.
 * The on-screen clock still shows the measured rate.
 */
export function useClockRate(): number | null {
  const measured = useSim((s) => s.rate)
  const speed = useRunStore((s) => (s.state?.available ? s.state.speed : null))
  if (speed == null || speed <= 0) return measured
  if (measured == null) return speed
  return Math.abs(measured - speed) / speed <= AGREE ? speed : measured
}
