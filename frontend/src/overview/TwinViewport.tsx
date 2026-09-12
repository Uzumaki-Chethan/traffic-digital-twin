import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Maximize2, Minimize2 } from 'lucide-react'
import type { LaneView } from '@/data/types'
import { JunctionPlate } from './JunctionPlate'

/**
 * The twin viewport plus its own controls. The fullscreen button lives
 * bottom-left and only appears on hover (or keyboard focus), so nothing
 * sits over the drawing while it is being read.
 *
 * Fullscreen uses the real Fullscreen API on the wrapper, so the plate
 * scales to the whole display — which is what a projector demo wants.
 */
export function TwinViewport({
  lanes,
  emergencyLanes,
  powered,
}: {
  lanes: LaneView[]
  emergencyLanes: string[]
  powered: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isFull, setIsFull] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (document.fullscreenElement === el) {
      void document.exitFullscreen()
    } else {
      void el.requestFullscreen?.().catch(() => {
        // Fullscreen can be blocked by permissions policy; the inline
        // view stays fully usable, so this is not worth surfacing.
      })
    }
  }, [])

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={
        isFull
          ? 'relative flex h-full w-full items-center justify-center bg-plate p-4'
          : 'relative aspect-[920/540] w-full overflow-hidden rounded-control bg-inset'
      }
    >
      <div className={isFull ? 'aspect-[920/540] max-h-full w-full max-w-full' : 'h-full w-full'}>
        <JunctionPlate lanes={lanes} emergencyLanes={emergencyLanes} powered={powered} />
      </div>

      <AnimatePresence>
        {(hovered || isFull) && (
          <motion.button
            type="button"
            onClick={toggle}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-3 left-3 flex items-center gap-2 rounded-control border border-rule bg-plate px-2.5 py-1.5 text-[12.5px] font-medium text-ink-strong shadow-[var(--shadow-panel)]"
            aria-label={isFull ? 'Exit fullscreen' : 'View fullscreen'}
          >
            {isFull ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
            {isFull ? 'Exit fullscreen' : 'Fullscreen'}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
