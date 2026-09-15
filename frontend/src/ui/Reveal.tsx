import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { DUR, EASE_OUT, STAGGER, arrive } from './motion'

/**
 * Staggered entrance for a page's panels.
 *
 * One sequence per page mount, never on data update — an operations
 * screen must not move in the periphery while it is being read, and a
 * value that animates every packet is unreadable. On arrival, though,
 * the sequence is what tells the eye the order to read the page in, so
 * it is deliberately visible: 14px of travel over 420ms, 70ms apart.
 * (It used to be 10px over 340ms at 55ms apart, which measured as
 * present and read as nothing at all.)
 *
 * Honours reduced motion by rendering the final state immediately.
 */
export function Reveal({ children, index = 0 }: { children: ReactNode; index?: number }) {
  const reduced = useReducedMotion()
  if (reduced) return <>{children}</>
  const { initial, animate, transition } = arrive(index)
  return (
    <motion.div initial={initial} animate={animate} transition={transition}>
      {children}
    </motion.div>
  )
}

/**
 * A bar or cell that grows from nothing to its value on first paint, then
 * eases between readings. `delay` places it in a page's arrival sequence.
 */
export function GrowBar({
  fraction,
  className,
  style,
  vertical = false,
  delay = 0,
}: {
  fraction: number
  className?: string
  style?: React.CSSProperties
  vertical?: boolean
  delay?: number
}) {
  const reduced = useReducedMotion()
  const pct = `${Math.max(0, Math.min(1, fraction)) * 100}%`
  if (reduced) {
    return <div className={className} style={{ ...style, [vertical ? 'height' : 'width']: pct }} />
  }
  return (
    <motion.div
      className={className}
      style={style}
      initial={vertical ? { height: 0 } : { width: 0 }}
      animate={vertical ? { height: pct } : { width: pct }}
      transition={{ duration: 0.55, delay, ease: EASE_OUT }}
    />
  )
}

/**
 * An accent rule that draws itself across the top of a panel as the panel
 * arrives — the one flourish borrowed wholesale from a design the user
 * approved elsewhere. It scales from the leading edge, so it reads as a
 * line being drawn rather than a box appearing.
 */
export function DrawnRule({ delay = 0, className }: { delay?: number; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className} />
  return (
    <motion.div
      className={className}
      style={{ transformOrigin: 'left center' }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: DUR.enter, delay: delay + STAGGER, ease: EASE_OUT }}
    />
  )
}
