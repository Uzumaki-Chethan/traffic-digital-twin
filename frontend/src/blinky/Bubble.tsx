import { AnimatePresence, motion } from 'framer-motion'

/**
 * Blinky's speech bubble, drawn inside its travelling wrapper so it moves
 * with it. `align` keeps it on screen near the edges.
 */
export function Bubble({ text, id, align, size }: { text: string | null; id: number; align: 'left' | 'center' | 'right'; size: number }) {
  const side = align === 'center' ? { left: '50%', translateX: '-50%' } : align === 'left' ? { left: `${0.5 * size}px`, translateX: '0%' } : { right: `${0.5 * size}px`, translateX: '0%' }
  return (
    <div data-blinky className="pointer-events-none absolute" style={{ bottom: `${1.8 * size - 0.32 * size}px`, ...('left' in side ? { left: side.left } : { right: side.right }) }}>
      <AnimatePresence>
        {text && (
          <motion.div
            key={id}
            role="status"
            className="blinky-bubble"
            style={{ translateX: side.translateX }}
            initial={{ opacity: 0, y: 8, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
