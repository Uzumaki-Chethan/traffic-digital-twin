import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Box, Crosshair, Map, Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import clsx from 'clsx'
import type { LaneView, VehicleView } from '@/data/types'
import { JunctionPlate } from './JunctionPlate'
import { usePanZoom, type ViewState } from './usePanZoom'

// three.js is ~150 kB gzipped, so the 3D view is split out and only
// fetched when someone actually switches to it. The plan view — the
// default, and the one a projector demo should use — costs nothing.
const Junction3D = lazy(() => import('./Junction3D').then((m) => ({ default: m.Junction3D })))

/**
 * The twin viewport and its controls. Two modes: the plan (default — a
 * true-scale map with sumo-gui's zoom: scroll, drag, and a button that
 * frames the junction; zooming right out shows the whole network) and
 * a to-scale 3D miniature. Controls sit bottom-left and appear on hover
 * or keyboard focus, so nothing covers the drawing while it is being
 * read.
 */
export function TwinViewport({
  lanes,
  emergencyLanes,
  vehicles,
  powered,
  allow3d = true,
  sharedView,
  releaseKey,
}: {
  lanes: LaneView[]
  emergencyLanes: string[]
  vehicles?: VehicleView[]
  powered: boolean
  /** Performance shows two junctions side by side in plan view only -
   * two three.js scenes at once is not a comparison anyone asked for. */
  allow3d?: boolean
  /** Lifted pan/zoom state, so two viewports frame the same window. */
  sharedView?: ViewState
  /** Phase identity, for the plate's one-shot release (utils/signal.phaseKey). */
  releaseKey?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [isFull, setIsFull] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [mode, setMode] = useState<'plan' | '3d'>('plan')
  // Scroll to zoom, drag to pan, in metres. Narrows the SVG viewBox, so
  // the drawing stays sharp at any magnification.
  const pan = usePanZoom(stage, sharedView)

  useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFull = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (document.fullscreenElement === el) void document.exitFullscreen()
    else
      void el.requestFullscreen?.().catch(() => {
        // Can be blocked by permissions policy; inline view stays usable.
      })
  }, [])

  const controlsVisible = hovered || isFull

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className={
        isFull
          ? 'relative flex h-full w-full items-center justify-center bg-plate p-4'
          : 'relative aspect-[920/540] w-full overflow-hidden rounded-control bg-inset'
      }
    >
      <div
        ref={stage}
        className={isFull ? 'aspect-[920/540] max-h-full w-full max-w-full' : 'h-full w-full'}
        style={
          mode === 'plan'
            ? { touchAction: 'none', cursor: 'grab' }
            : undefined
        }
        {...(mode === 'plan' ? pan.handlers : {})}
      >
        {mode === 'plan' ? (
          <JunctionPlate
            lanes={lanes}
            emergencyLanes={emergencyLanes}
            vehicles={vehicles}
            powered={powered}
            viewBox={pan.viewBox}
            pxPerMetre={pan.pxPerMetre}
            releaseKey={releaseKey}
          />
        ) : (
          <Suspense
            fallback={<div className="flex h-full items-center justify-center text-[13px] text-ink">Loading 3D model…</div>}
          >
            <Junction3D lanes={lanes} vehicles={vehicles} powered={powered} />
          </Suspense>
        )}
      </div>

      <AnimatePresence>
        {controlsVisible && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-3 left-3 flex items-center gap-1.5"
          >
            {allow3d && (
              <div className="flex overflow-hidden rounded-control border border-rule bg-plate shadow-[var(--shadow-panel)]">
                <ModeButton active={mode === 'plan'} onClick={() => setMode('plan')} icon={<Map size={14} aria-hidden />} label="Plan" />
                <ModeButton active={mode === '3d'} onClick={() => setMode('3d')} icon={<Box size={14} aria-hidden />} label="3D" />
              </div>
            )}

            {mode === 'plan' && (
              <div className="flex items-center overflow-hidden rounded-control border border-rule bg-plate shadow-[var(--shadow-panel)]">
                <IconButton onClick={() => pan.zoomBy(1 / 1.6)} label="Zoom out" icon={<Minus size={14} aria-hidden />} disabled={!pan.canZoomOut} />
                <span className="num w-[46px] px-1 text-center text-[12px] text-ink-mute" title="Zoom; 1× shows the whole network">
                  {pan.zoom.toFixed(1)}×
                </span>
                <IconButton onClick={() => pan.zoomBy(1.6)} label="Zoom in" icon={<Plus size={14} aria-hidden />} disabled={!pan.canZoomIn} />
                <IconButton onClick={pan.home} label="Frame the junction" icon={<Crosshair size={13} aria-hidden />} disabled={pan.atHome} />
              </div>
            )}
            <button
              type="button"
              onClick={toggleFull}
              aria-label={isFull ? 'Exit fullscreen' : 'View fullscreen'}
              className="flex items-center gap-2 rounded-control border border-rule bg-plate px-2.5 py-1.5 text-[12.5px] font-medium text-ink-strong shadow-[var(--shadow-panel)]"
            >
              {isFull ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
              {isFull ? 'Exit fullscreen' : 'Fullscreen'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function IconButton({
  onClick,
  label,
  icon,
  disabled,
}: {
  onClick: () => void
  label: string
  icon: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        'flex items-center px-2 py-1.5 text-ink-strong transition-colors',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-hover',
      )}
    >
      {icon}
    </button>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
        active ? 'bg-ink-strong text-ink-on-dark' : 'text-ink-strong hover:bg-hover',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
