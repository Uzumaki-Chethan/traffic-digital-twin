import { useEffect, useRef } from 'react'
import { animate, useMotionValue, useReducedMotion, useTransform, motion } from 'framer-motion'

/**
 * A live number that tweens to its new value instead of snapping, so a
 * changing reading reads as movement rather than a flicker. Tabular
 * figures mean the width never shifts while it counts.
 *
 * Deliberately capped at --dur-value (300ms): any slower and the figure
 * on screen lags behind the simulation, which on an operations display
 * is worse than a snap.
 */
export function Num({
  value,
  digits = 0,
  className,
}: {
  value: number
  digits?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => v.toFixed(digits))
  const first = useRef(true)

  useEffect(() => {
    if (first.current || reduced) {
      first.current = false
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration: 0.3, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [value, mv, reduced])

  return <motion.span className={className}>{text}</motion.span>
}
