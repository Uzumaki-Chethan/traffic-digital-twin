import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Box, Crosshair, Link2, Map, Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import clsx from 'clsx'
import type { LaneView, VehicleView } from '@/data/types'
import type { MotionSide } from '@/data/motion'
import { DUR, EASE_OUT } from '@/ui/motion'
import { JunctionPlate } from './JunctionPlate'
import { usePanZoom, wheelIsZoom, type View, type ViewState } from './usePanZoom'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** How to zoom, in the reader's own keys - a tooltip on the readout, never printed on the map. */
const ZOOM_TITLE = `Zoom - ${isMac ? '⌘' : 'Ctrl'} + scroll or pinch to zoom; 1× shows the whole network`

// three.js is ~150 kB gzipped, so the 3D view is split out and only
// fetched when someone actually switches to it. The plan view — the
// default, and the one a projector demo should use — costs nothing.
const Junction3D = lazy(() => import('./Junction3D').then((m) => ({ default: m.Junction3D })))

/**
 * The twin viewport and its controls. Two modes: the plan (default — a
 * true-scale map with a map's zoom: Ctrl + scroll, drag, and a button
 * that frames the junction; zooming right out shows the whole network)
 * and a to-scale 3D miniature. Controls sit bottom-left and appear on
 * hover or keyboard focus, so nothing covers the drawing while it is
 * being read.
 *
 * A plain wheel turn scrolls the page in both modes — the map is one
 * panel in a column, not the page. Fullscreen has nothing to scroll, so
 * there the wheel zooms directly.
 */
export function TwinViewport({
  lanes,
  emergencyLanes,
  vehicles,
  powered,
  allow3d = true,
  sharedView,
  matchView,
  releaseKey,
  motionSide = 'demo',
}: {
  lanes: LaneView[]
  emergencyLanes: string[]
  vehicles?: VehicleView[]
  powered: boolean
  /** Performance shows two junctions side by side in plan view only -
   * two three.js scenes at once is not a comparison anyone asked for. */
  allow3d?: boolean
  /** Lifted pan/zoom state, so the page can read and set this window's framing. */
  sharedView?: ViewState
  /** A partner window's framing to copy on demand (Performance's "Match"). */
  matchView?: { label: string; view: View }
  /** Phase identity, for the plate's one-shot release (utils/signal.phaseKey). */
  releaseKey?: number
  /** Which fleet to draw: the demo's, or one side of an evaluation (data/motion.ts). */
  motionSide?: MotionSide
}) {
  const ref = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [isFull, setIsFull] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [mode, setMode] = useState<'plan' | '3d'>('plan')
  // Ctrl + scroll to zoom, drag to pan, in metres. Narrows the SVG
  // viewBox, so the drawing stays sharp at any magnification.
  const pan = usePanZoom(stage, sharedView, { wheelZoomsPlain: isFull })

  // In 3D, OrbitControls owns the wheel and would zoom on any turn. A
  // capturing listener on the stage runs before the canvas's own, so a
  // plain turn is stopped short of OrbitControls and left to the page.
  useEffect(() => {
    const el = stage.current
    if (!el || mode !== '3d' || isFull) return
    const guard = (e: WheelEvent) => {
      if (!wheelIsZoom(e)) e.stopPropagation()
    }
    el.addEventListener('wheel', guard, { capture: true, passive: true })
    return () => el.removeEventListener('wheel', guard, { capture: true })
  }, [mode, isFull])

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
            ? { touchAction: 'none', cursor: pan.dragging ? 'grabbing' : 'grab' }
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
            motionSide={motionSide}
          />
        ) : (
          <Suspense
            fallback={<div className="flex h-full items-center justify-center text-[13px] text-ink">Loading 3D model…</div>}
          >
            <Junction3D lanes={lanes} vehicles={vehicles} powered={powered} motionSide={motionSide} />
          </Suspense>
        )}
      </div>

      <AnimatePresence>
        {controlsVisible && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: DUR.fast, ease: EASE_OUT }}
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
                <span className="num w-[46px] px-1 text-center text-[12px] text-ink-mute" title={ZOOM_TITLE}>
                  {pan.zoom.toFixed(1)}×
                </span>
                <IconButton onClick={() => pan.zoomBy(1.6)} label="Zoom in" icon={<Plus size={14} aria-hidden />} disabled={!pan.canZoomIn} />
                <IconButton onClick={pan.home} label="Frame the junction" icon={<Crosshair size={13} aria-hidden />} disabled={pan.atHome} />
                {matchView && (
                  <IconButton
                    onClick={() => pan.setView(matchView.view)}
                    label={`Match ${matchView.label}'s view`}
                    icon={<Link2 size={13} aria-hidden />}
                    disabled={sameView(pan.view, matchView.view)}
                  />
                )}
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

function sameView(a: View, b: View): boolean {
  return Math.abs(a.cx - b.cx) < 0.01 && Math.abs(a.cy - b.cy) < 0.01 && Math.abs(a.h - b.h) < 0.01
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
