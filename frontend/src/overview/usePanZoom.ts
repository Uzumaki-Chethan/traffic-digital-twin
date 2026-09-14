import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { CENTRE, NET, PLATE_ASPECT } from './plateGeometry'

/**
 * Pan and zoom for the plan view, in metres.
 *
 * The plan view is a true-scale map (plateGeometry), so the viewport is
 * a window onto the network: a centre and a visible height, both in
 * metres. Zooming out stops at the whole 400 m network (1x); the
 * "Junction" button frames the box and the first ~53 m of each arm,
 * where queues form, which is also the default. Scroll to zoom about
 * the pointer, drag to pan, like sumo-gui. It narrows the SVG viewBox
 * rather than CSS-transforming the element, so it stays vector-sharp.
 *
 * It also measures the stage, so the plate can draw labels and signal
 * heads at a constant PIXEL size whatever the zoom (pxPerMetre).
 *
 * The view state can be lifted: the Performance page hands both windows
 * one state so Trinetra and the baseline are always framed identically.
 *
 * The wheel listener is attached manually because React's onWheel is
 * passive — preventDefault() there is ignored, and the page would scroll
 * underneath the drawing while you zoomed.
 */

export interface View {
  /** Centre of the window, plan metres. */
  cx: number
  cy: number
  /** Visible height, metres. Width follows the stage's aspect. */
  h: number
}

/** Junction framing: 150 m tall - the 43 m box plus ~53 m of each arm. */
export const HOME_VIEW: View = { cx: CENTRE, cy: CENTRE, h: 150 }
/** Whole network, with a little ground round it - the zoom-out limit, 1x. */
export const FIT_VIEW: View = { cx: CENTRE, cy: CENTRE, h: NET + 12 }
const MIN_H = 24

export type ViewState = [View, Dispatch<SetStateAction<View>>]

function clamp(v: View): View {
  const h = Math.min(FIT_VIEW.h, Math.max(MIN_H, v.h))
  return {
    h,
    cx: Math.min(NET, Math.max(0, v.cx)),
    cy: Math.min(NET, Math.max(0, v.cy)),
  }
}

function same(a: View, b: View): boolean {
  return Math.abs(a.cx - b.cx) < 0.01 && Math.abs(a.cy - b.cy) < 0.01 && Math.abs(a.h - b.h) < 0.01
}

export function usePanZoom(target: RefObject<HTMLElement | null>, shared?: ViewState) {
  const local = useState<View>(HOME_VIEW)
  const [view, setView] = shared ?? local
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const [stagePx, setStagePx] = useState({ w: 920, h: 540 })

  useEffect(() => {
    const el = target.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setStagePx({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [target])

  const aspect = stagePx.h > 0 ? stagePx.w / stagePx.h : PLATE_ASPECT

  /** Zoom by a factor, keeping the point at (fx, fy) of the box fixed. */
  const zoomAt = useCallback(
    (factor: number, fx: number, fy: number) => {
      setView((v) => {
        const h = Math.min(FIT_VIEW.h, Math.max(MIN_H, v.h / factor))
        const w0 = v.h * aspect
        const w1 = h * aspect
        // The metre under that spot stays under it.
        const px = v.cx - w0 / 2 + fx * w0
        const py = v.cy - v.h / 2 + fy * v.h
        return clamp({ h, cx: px - fx * w1 + w1 / 2, cy: py - fy * h + h / 2 })
      })
    },
    [aspect, setView],
  )

  const zoomBy = useCallback((factor: number) => zoomAt(factor, 0.5, 0.5), [zoomAt])
  const home = useCallback(() => setView(HOME_VIEW), [setView])
  const fit = useCallback(() => setView(FIT_VIEW), [setView])

  useEffect(() => {
    const el = target.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      zoomAt(
        Math.exp(-e.deltaY * 0.0016),
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height,
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [target, zoomAt])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      const rect = e.currentTarget.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      d.x = e.clientX
      d.y = e.clientY
      setView((v) =>
        clamp({
          ...v,
          cx: v.cx - (dx / rect.height) * v.h,
          cy: v.cy - (dy / rect.height) * v.h,
        }),
      )
    },
    [setView],
  )

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  const w = view.h * aspect
  const pxPerMetre = stagePx.h / view.h

  return {
    view,
    viewBox: `${(view.cx - w / 2).toFixed(2)} ${(view.cy - view.h / 2).toFixed(2)} ${w.toFixed(2)} ${view.h.toFixed(2)}`,
    /** Magnification relative to the whole network fitted: 1x at Fit. */
    zoom: FIT_VIEW.h / view.h,
    pxPerMetre,
    atHome: same(view, HOME_VIEW),
    atFit: same(view, FIT_VIEW),
    canZoomIn: view.h > MIN_H + 0.01,
    canZoomOut: view.h < FIT_VIEW.h - 0.01,
    zoomBy,
    home,
    fit,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
