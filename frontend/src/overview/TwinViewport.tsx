import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Crosshair, Layers, Link2, Maximize2, Minimize2, Minus, Plus, ScanSearch } from 'lucide-react'
import clsx from 'clsx'
import type { LaneView, VehicleView } from '@/data/types'
import type { MotionSide } from '@/data/motion'
import { JunctionPlate } from './JunctionPlate'
import { ErrorBoundary } from '@/ui/ErrorBoundary'
import { HOME_VIEW, usePanZoom, wheelIsZoom, type View, type ViewState } from './usePanZoom'

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
 * and a to-scale 3D miniature. Controls float over the map as small
 * glass pills: the view toggle top-left, the map tools (approach labels,
 * frame the junction, zoom to the stop lines) top-right, zoom and
 * fullscreen bottom-right.
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
  raining = false,
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
  /** True only while the running scenario is Rain (data/pageContext.ts). */
  raining?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [isFull, setIsFull] = useState(false)
  const [labels, setLabels] = useState(true)
  // The view before "zoom to the stop lines", so a second press returns.
  const beforeFocus = useRef<View | null>(null)
  const [mode, setMode] = useState<'plan' | '3d'>('plan')
  // Ctrl + scroll to zoom, drag to pan, in metres. Narrows the SVG
  // viewBox, so the drawing stays sharp at any magnification.
  const pan = usePanZoom(stage, sharedView, { wheelZoomsPlain: isFull })
  const focused = sameView(pan.view, FOCUS_VIEW)

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

  return (
    <div
      ref={ref}
      className={
        isFull
          ? 'relative flex h-full w-full items-center justify-center bg-[var(--plate-ground)] p-4'
          : 'relative aspect-[920/540] w-full overflow-hidden rounded-[16px] bg-[var(--plate-ground)] shadow-[0_0_0_1px_rgb(15_25_48/0.18),0_12px_26px_-16px_rgb(0_0_0/0.7)]'
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
            raining={raining}
            showLabels={labels}
          />
        ) : (
          // A failure in the 3D view stays in this box — the page, the run and
          // the plan view carry on (Section 37.18).
          <ErrorBoundary
            renderFallback={(error, reset) => (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[13px] text-ink">
                <div className="font-medium text-ink-strong">The 3D view hit a problem.</div>
                <div className="num max-w-[60ch] break-words text-[11.5px] text-ink-mute">{error.message}</div>
                <div className="flex gap-2">
                  <button type="button" onClick={reset} className="fx-btn fx-soft rounded-full border border-white/60 bg-white/70 px-4 py-1.5 font-medium text-ink-strong">
                    Try again
                  </button>
                  <button type="button" onClick={() => setMode('plan')} className="fx-btn fx-soft rounded-full border border-white/60 bg-white/70 px-4 py-1.5 font-medium text-ink-strong">
                    Back to plan
                  </button>
                </div>
              </div>
            )}
          >
            <Suspense
              fallback={<div className="flex h-full items-center justify-center text-[13px] text-ink">Loading 3D model…</div>}
            >
              <Junction3D lanes={lanes} vehicles={vehicles} powered={powered} motionSide={motionSide} raining={raining} />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>

      {allow3d && (
        <div className="absolute left-3 top-3 flex rounded-full p-[3px] map-pill">
          <ModeButton active={mode === 'plan'} onClick={() => setMode('plan')} label="Plan" />
          <ModeButton active={mode === '3d'} onClick={() => setMode('3d')} label="3D" />
        </div>
      )}

      {mode === 'plan' && (
        <div data-explain="twin-tools" className="absolute right-3 top-3 flex flex-col gap-0.5 rounded-[14px] p-1 map-pill">
          <IconButton
            onClick={() => setLabels((v) => !v)}
            label={labels ? 'Hide the approach names' : 'Show the approach names'}
            icon={<Layers size={16} aria-hidden />}
            pressed={labels}
          />
          <IconButton onClick={pan.home} label="Frame the junction" icon={<Crosshair size={16} aria-hidden />} disabled={pan.atHome} />
          <IconButton
            onClick={() => {
              // A toggle: in to the stop lines, and back to exactly where
              // the view was before.
              if (focused) {
                pan.setView(beforeFocus.current ?? HOME_VIEW)
                beforeFocus.current = null
              } else {
                beforeFocus.current = pan.view
                pan.setView(FOCUS_VIEW)
              }
            }}
            label={focused ? 'Back to the previous view' : 'Zoom in to the stop lines'}
            icon={<ScanSearch size={16} aria-hidden />}
            pressed={focused}
          />
        </div>
      )}

      {/* Zoom row: bottom-right beside the compass; where there is no
          view toggle (Performance's side-by-side windows) it moves to the
          bottom-left with an icon-only Match, narrow enough to clear the
          South label in a half-width window. */}
      {/* The plan's compass: a round pill right above the fullscreen button
          (the 3D view has its own, which turns with the camera). */}
      {mode === 'plan' && (
        <div
          className="map-pill pointer-events-none absolute bottom-[58px] right-3 flex h-[34px] w-[34px] items-center justify-center rounded-full"
          aria-label="Compass: north is up"
          role="img"
        >
          <svg viewBox="-17 -17 34 34" className="h-[30px] w-[30px]" aria-hidden>
            <path d="M 0 -11 L -4 0 L 4 0 Z" fill="#E5484D" />
            <path d="M 0 11 L -4 0 L 4 0 Z" fill="#2F6BFF" />
            <circle r="1.6" fill="#fff" />
          </svg>
          <span className="num absolute -top-3.5 text-[10.5px] font-bold text-[var(--plate-ink)] [text-shadow:0_0_3px_#fff,0_0_3px_#fff]">N</span>
        </div>
      )}

      <div className={clsx('absolute bottom-3 flex items-center gap-2', allow3d ? 'right-3' : 'left-3')}>
        {mode === 'plan' && (
          <>
            <IconButton round onClick={() => pan.zoomBy(1 / 1.6)} label="Zoom out" icon={<Minus size={16} aria-hidden />} disabled={!pan.canZoomOut} />
            <span className="map-pill num flex h-[34px] min-w-[58px] items-center justify-center rounded-full px-2 text-[12.5px] font-medium text-[#8A5A00]" title={ZOOM_TITLE}>
              {pan.zoom.toFixed(1)}×
            </span>
            <IconButton round onClick={() => pan.zoomBy(1.6)} label="Zoom in" icon={<Plus size={16} aria-hidden />} disabled={!pan.canZoomIn} />
            {matchView && (
              <button
                type="button"
                onClick={() => pan.setView(matchView.view)}
                disabled={sameView(pan.view, matchView.view)}
                title={`Match ${matchView.label}'s view`}
                aria-label={`Match ${matchView.label}'s view`}
                className="map-pill flex h-[34px] w-[34px] items-center justify-center rounded-full text-[var(--plate-ink)] disabled:opacity-45"
              >
                <Link2 size={15} aria-hidden />
              </button>
            )}
          </>
        )}
        <IconButton
          round
          onClick={toggleFull}
          label={isFull ? 'Exit fullscreen' : 'View fullscreen'}
          icon={isFull ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
        />
      </div>
    </div>
  )
}

/** "Zoom in to the stop lines": the junction framing, 2.2x closer. */
const FOCUS_VIEW: View = { ...HOME_VIEW, h: HOME_VIEW.h / 2.2 }

function sameView(a: View, b: View): boolean {
  return Math.abs(a.cx - b.cx) < 0.01 && Math.abs(a.cy - b.cy) < 0.01 && Math.abs(a.h - b.h) < 0.01
}

function IconButton({
  onClick,
  label,
  icon,
  disabled,
  round,
  pressed,
}: {
  onClick: () => void
  label: string
  icon: React.ReactNode
  disabled?: boolean
  /** A free-standing round pill; otherwise an item in the tool stack. */
  round?: boolean
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={clsx(
        'flex items-center justify-center text-[var(--plate-ink)] transition-colors',
        round ? 'map-pill h-[34px] w-[34px] rounded-full' : 'h-9 w-9 rounded-[10px]',
        !round && (pressed ? 'bg-[rgb(18_183_106/0.16)] text-[#067647]' : 'hover:bg-[rgb(27_37_54/0.08)]'),
        disabled ? 'cursor-not-allowed opacity-40' : round && 'hover:bg-white',
      )}
    >
      {icon}
    </button>
  )
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'h-8 rounded-full px-5 text-[13.5px] font-medium transition-colors',
        active ? 'text-white' : 'text-[var(--plate-ink)] hover:bg-[rgb(27_37_54/0.07)]',
      )}
      style={
        active
          ? { background: 'linear-gradient(180deg, var(--brand-hi), var(--brand))', boxShadow: '0 0 16px -2px rgb(255 140 20 / 0.85)' }
          : undefined
      }
    >
      {label}
    </button>
  )
}
