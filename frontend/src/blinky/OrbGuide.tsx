import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { targetAt, targetLabel, type Target } from './targets'
import { TargetHighlight } from './TargetHighlight'
import type { Vec } from './types'

const RETURN_MS = 480
const TRAIL = 22

/**
 * Drag-to-explain with one of Zen's floating orbs (Section 40). Mounted
 * while an orb is held: the orb follows the pointer trailing golden light
 * (one full-screen canvas, drawn additively), and the explainable thing
 * under it gets the outline and name tag. On release — over a target or
 * not, or on Esc / a cancelled pointer — `onDrop` reports the choice at
 * once and the orb flies home to `getHome()` (where it orbits Zen), then
 * `onDone` unmounts the guide.
 */
export function OrbGuide({
  start,
  getHome,
  onDrop,
  onDone,
}: {
  start: Vec
  getHome: () => Vec
  onDrop: (t: Target | null) => void
  onDone: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<Target | null>(null)
  const hoverRef = useRef<Target | null>(null)
  const cbs = useRef({ getHome, onDrop, onDone })
  const startRef = useRef(start)
  useLayoutEffect(() => {
    cbs.current = { getHome, onDrop, onDone }
  })

  useEffect(() => {
    const cvs = ref.current
    const ctx = cvs?.getContext('2d')
    if (!cvs || !ctx) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const fit = () => {
      cvs.width = Math.round(window.innerWidth * dpr)
      cvs.height = Math.round(window.innerHeight * dpr)
    }
    fit()
    window.addEventListener('resize', fit)

    let pos: Vec = { ...startRef.current }
    const trail: Vec[] = []
    let returning: { at: number; from: Vec } | null = null
    let raf = 0

    const setTarget = (t: Target | null) => {
      if (t?.el === hoverRef.current?.el) return
      hoverRef.current = t
      setHover(t)
    }
    const release = (t: Target | null) => {
      if (returning) return
      setTarget(null)
      cbs.current.onDrop(t)
      returning = { at: performance.now(), from: { ...pos } }
    }
    const move = (e: PointerEvent) => {
      if (returning) return
      pos = { x: e.clientX, y: e.clientY }
      setTarget(targetAt(e.clientX, e.clientY))
    }
    const up = (e: PointerEvent) => release(targetAt(e.clientX, e.clientY))
    const cancel = () => release(null)
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') release(null)
    }

    const drawOrb = (p: Vec, r: number, t: number) => {
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2)
      halo.addColorStop(0, 'rgba(255,214,130,0.75)')
      halo.addColorStop(0.35, 'rgba(255,170,60,0.28)')
      halo.addColorStop(1, 'rgba(255,150,40,0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2)
      ctx.fill()
      // black glass with a turning gold swirl
      ctx.fillStyle = '#060504'
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#ffd27a'
      ctx.lineWidth = r * 0.14
      ctx.beginPath()
      ctx.arc(p.x, p.y, r * 0.78, 0, Math.PI * 2)
      ctx.stroke()
      for (let k = 0; k < 3; k++) {
        const a = t * 3 + (k * Math.PI * 2) / 3
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 0.38, a, a + 1.6)
        ctx.stroke()
        ctx.fillStyle = '#ffd27a'
        ctx.beginPath()
        ctx.arc(p.x + Math.cos(a) * r * 0.38, p.y + Math.sin(a) * r * 0.38, r * 0.11, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.beginPath()
      ctx.arc(p.x - r * 0.35, p.y - r * 0.4, r * 0.14, 0, Math.PI * 2)
      ctx.fill()
    }

    const frame = (now: number) => {
      let p = pos
      if (returning) {
        const u = Math.min(1, (now - returning.at) / RETURN_MS)
        const k = 1 - (1 - u) ** 3
        const home = cbs.current.getHome()
        // an arc home, rising a little on the way
        p = { x: returning.from.x + (home.x - returning.from.x) * k, y: returning.from.y + (home.y - returning.from.y) * k - Math.sin(k * Math.PI) * 60 }
        if (u >= 1) {
          cbs.current.onDone()
          return
        }
      }
      trail.push(p)
      if (trail.length > TRAIL) trail.shift()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      ctx.globalCompositeOperation = 'lighter'
      trail.forEach((q, i) => {
        const k = i / trail.length
        const r = 2 + k * 9
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 2)
        g.addColorStop(0, `rgba(255,214,130,${0.5 * k})`)
        g.addColorStop(1, 'rgba(255,160,40,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(q.x, q.y, r * 2, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalCompositeOperation = 'source-over'
      drawOrb(p, 13, now / 1000)
      raf = requestAnimationFrame(frame)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', fit)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
    }
  }, [])

  return (
    <>
      <canvas data-blinky ref={ref} className="blinky-cable" style={{ width: '100vw', height: '100vh' }} />
      {hover && <TargetHighlight el={hover.el} label={targetLabel(hover.id)} />}
    </>
  )
}
