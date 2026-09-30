import { useEffect, useRef } from 'react'
import cityNight from '@/assets/city-night.jpg'
import frost from '@/assets/city-night-frost.jpg'

/**
 * The night city behind the whole console, in two static layers:
 *
 * 1. The photo. Fixed, oversized by 4 % on every side so it can drift, and
 *    drifting only a few pixels against the pointer — a sense of depth,
 *    never a zoom (the owner asked for exactly this much, no Ken Burns).
 *
 * 2. The FROST: a pre-blurred copy of the photo, cut (clip-path) to the
 *    shapes of the rail and the main container — every element marked
 *    `data-frost` — so they read as frosted glass. It lives HERE, on its own
 *    compositor layer, rather than as the containers' own
 *    `background-attachment: fixed` background: a fixed background can't
 *    be cached, so Chrome repainted the whole container, photo and all,
 *    every time a panel inside it updated (once per simulated second) —
 *    the periodic hiccup in the traffic (Section 37.12). Painted once here,
 *    it is only re-cut when a container moves or resizes.
 */
export function Backdrop() {
  const photo = useRef<HTMLDivElement>(null)
  const frostLayers = useRef<HTMLDivElement>(null)

  // Pointer parallax on the photo only.
  useEffect(() => {
    const el = photo.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let tx = 0
    let ty = 0
    let x = 0
    let y = 0
    let raf = 0
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / innerWidth) * 2 - 1
      ty = (e.clientY / innerHeight) * 2 - 1
      if (!raf) raf = requestAnimationFrame(step)
    }
    const step = () => {
      x += (tx - x) * 0.05
      y += (ty - y) * 0.05
      el.style.transform = `translate3d(${(-x * 8).toFixed(1)}px, ${(-y * 5.5).toFixed(1)}px, 0)`
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(step) : 0
    }
    addEventListener('pointermove', onMove, { passive: true })
    return () => {
      removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Keep one frost cut-out per [data-frost] element, matched to its box and
  // corner radius. Re-cut on resize (window, or the rail collapsing).
  useEffect(() => {
    const host = frostLayers.current
    if (!host) return
    let raf = 0
    const cut = () => {
      raf = 0
      const targets = [...document.querySelectorAll<HTMLElement>('[data-frost]')]
      while (host.children.length < targets.length) {
        const d = document.createElement('div')
        d.className = 'frost-cut'
        d.style.backgroundImage = `url(${frost})`
        host.appendChild(d)
      }
      while (host.children.length > targets.length) host.lastChild?.remove()
      targets.forEach((t, i) => {
        const r = t.getBoundingClientRect()
        const radius = getComputedStyle(t).borderTopLeftRadius || '0px'
        const layer = host.children[i] as HTMLElement
        layer.style.clipPath = `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round ${radius})`
      })
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(cut)
    }
    // The rail and the container mount in the same commit as this layer
    // (Shell), so they exist by now. A ResizeObserver catches every change
    // of their boxes — the window resizing, the rail collapsing — and
    // nothing else, so this never runs per animation frame.
    const ro = new ResizeObserver(schedule)
    document.querySelectorAll('[data-frost]').forEach((t) => ro.observe(t))
    addEventListener('resize', schedule)
    schedule()
    return () => {
      ro.disconnect()
      removeEventListener('resize', schedule)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-page">
      <div
        ref={photo}
        className="absolute -inset-[4%] bg-cover bg-center will-change-transform"
        style={{ backgroundImage: `url(${cityNight})` }}
      />
      {/* A vignette and a slight darkening at the top, so white text on the
          frosted container holds against the brightest windows. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 45%, transparent 55%, rgb(2 6 16 / 0.45) 100%), linear-gradient(180deg, rgb(4 10 24 / 0.18), transparent 30%)',
        }}
      />
      <div ref={frostLayers} />
    </div>
  )
}
