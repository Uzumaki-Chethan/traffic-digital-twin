import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/**
 * Staggered entrance for a page's panels.
 *
 * Used sparingly and only once per page mount — the design brief bans
 * fade-and-slide-up as a general-purpose entrance, and peripheral motion
 * on a live operations screen is a defect rather than a flourish. The
 * user asked for visible motion, so this is the one place a page is
 * allowed it: on arrival, never on data update. Honours reduced motion.
 */
export function Reveal({ children, index = 0 }: { children: ReactNode; index?: number }) {
  const reduced = useReducedMotion()
  if (reduced) return <>{children}</>
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: Math.min(index * 0.055, 0.4), ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** A bar or cell that grows from nothing to its value on first paint. */
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
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    />
  )
}
