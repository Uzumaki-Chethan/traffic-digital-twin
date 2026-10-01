import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { targetAt, targetLabel, type Target } from './targets'
import { TargetHighlight } from './TargetHighlight'
import type { Vec } from './types'

/**
 * The drag-to-explain cable (spec §7.1). Mounted while the antenna ball is
 * held: a springy SVG cable from the ball to the pointer, and a live
 * highlight on the explainable thing under it. Releasing over a target
 * calls onDrop(target); over nothing, the cable snaps back first, then
 * onDrop(null).
 */
export function AntennaGuide({ getBall, onHover, onDrop }: { getBall: () => Vec; onHover: (t: Target | null) => void; onDrop: (t: Target | null) => void }) {
  const pathRef = useRef<SVGPathElement>(null)
  const tipRef = useRef<SVGCircleElement>(null)
  const [hover, setHover] = useState<Target | null>(null)
  const hoverRef = useRef<Target | null>(null)
  const cbs = useRef({ onHover, onDrop, getBall })
  useLayoutEffect(() => {
    cbs.current = { onHover, onDrop, getBall }
  })

  useEffect(() => {
    let end: Vec | null = null
    let snapFrom: { at: number; from: Vec } | null = null
    const ctrl = { ...cbs.current.getBall(), vx: 0, vy: 0 }
    let last = performance.now()
    let raf = 0

    const move = (e: PointerEvent) => {
      if (snapFrom) return
      end = { x: e.clientX, y: e.clientY }
      const t = targetAt(e.clientX, e.clientY)
      if (t?.el !== hoverRef.current?.el) {
        hoverRef.current = t
        setHover(t)
        cbs.current.onHover(t)
      }
    }
    const up = (e: PointerEvent) => {
      if (snapFrom) return
      const t = targetAt(e.clientX, e.clientY)
      if (t) {
        cbs.current.onDrop(t)
        return
      }
      hoverRef.current = null
      setHover(null)
      cbs.current.onHover(null)
      snapFrom = { at: performance.now(), from: end ?? cbs.current.getBall() }
    }
    const frame = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const a = cbs.current.getBall()
      let b = end ?? a
      if (snapFrom) {
        const u = Math.min(1, (now - snapFrom.at) / 220)
        const k = 1 - (1 - u) ** 3
        b = { x: snapFrom.from.x + (a.x - snapFrom.from.x) * k, y: snapFrom.from.y + (a.y - snapFrom.from.y) * k }
        if (u >= 1) {
          cbs.current.onDrop(null)
          return
        }
      }
      // The cable's middle is a damped spring that sags under "gravity".
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      const tx = (a.x + b.x) / 2
      const ty = (a.y + b.y) / 2 + Math.min(80, 0.18 * len)
      ctrl.vx = (ctrl.vx + (tx - ctrl.x) * 180 * dt) * 0.86
      ctrl.vy = (ctrl.vy + (ty - ctrl.y) * 180 * dt) * 0.86
      ctrl.x += ctrl.vx * dt * 10
      ctrl.y += ctrl.vy * dt * 10
      pathRef.current?.setAttribute('d', `M${a.x},${a.y} Q${ctrl.x},${ctrl.y} ${b.x},${b.y}`)
      tipRef.current?.setAttribute('cx', String(b.x))
      tipRef.current?.setAttribute('cy', String(b.y))
      raf = requestAnimationFrame(frame)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  return (
    <>
      <svg data-blinky className="blinky-cable" width="100%" height="100%">
        <defs>
          <linearGradient id="blinky-cable-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#ff3b47" />
            <stop offset="0.5" stopColor="#ffb020" />
            <stop offset="1" stopColor="#2af28e" />
          </linearGradient>
        </defs>
        <path ref={pathRef} fill="none" stroke="url(#blinky-cable-grad)" strokeWidth="3" strokeLinecap="round" />
        <circle ref={tipRef} r="7" fill="#2af28e" stroke="#fff" strokeWidth="2" />
      </svg>
      {hover && <TargetHighlight el={hover.el} label={targetLabel(hover.id)} />}
    </>
  )
}
