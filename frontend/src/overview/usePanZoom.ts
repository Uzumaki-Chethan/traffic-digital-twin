import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Pan and zoom for the plan view.
 *
 * The 3D miniature has had orbit/zoom/pan since it was built; the plan
 * view had nothing, so the only way to look closely at one approach was
 * fullscreen. This gives it the same freedom in the idiom a flat drawing
 * wants: scroll to zoom about the pointer, drag to pan, and a reset.
 *
 * It works by narrowing the SVG viewBox rather than CSS-transforming the
 * element, so everything stays vector-sharp at any magnification and the
 * hairlines do not thicken.
 *
 * The wheel listener is attached manually because React's onWheel is
 * passive — preventDefault() there is ignored, and the page would scroll
 * underneath the drawing while you zoomed.
 */

export interface View {
  x: number
  y: number
  k: number
}

const MIN_ZOOM = 1
const MAX_ZOOM = 12

export function usePanZoom(target: RefObject<HTMLElement | null>, width: number, height: number) {
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)

  const clamp = useCallback(
    (v: View): View => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k))
      const w = width / k
      const h = height / k
      return {
        k,
        x: Math.min(width - w, Math.max(0, v.x)),
        y: Math.min(height - h, Math.max(0, v.y)),
      }
    },
    [width, height],
  )

  /** Zoom by a factor, keeping the point at (fx, fy) of the box fixed. */
  const zoomAt = useCallback(
    (factor: number, fx: number, fy: number) => {
      setView((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor))
        // The plate coordinate currently under that spot stays under it.
        const px = v.x + fx * (width / v.k)
        const py = v.y + fy * (height / v.k)
        return clamp({ k, x: px - fx * (width / k), y: py - fy * (height / k) })
      })
    },
    [clamp, width, height],
  )

  const zoomBy = useCallback((factor: number) => zoomAt(factor, 0.5, 0.5), [zoomAt])
  const reset = useCallback(() => setView({ x: 0, y: 0, k: 1 }), [])

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
          x: v.x - (dx / rect.width) * (width / v.k),
          y: v.y - (dy / rect.height) * (height / v.k),
        }),
      )
    },
    [clamp, width, height],
  )

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  const w = width / view.k
  const h = height / view.k

  return {
    view,
    viewBox: `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`,
    zoomed: view.k > 1.001,
    zoomBy,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
