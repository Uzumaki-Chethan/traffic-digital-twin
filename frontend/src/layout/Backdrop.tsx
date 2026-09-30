import { useEffect, useRef } from 'react'
import cityNight from '@/assets/city-night.jpg'

/**
 * The night city behind the whole console. Fixed, oversized by 4 % on every
 * side so it can drift, and drifting only a few pixels against the pointer
 * (at most 16 px across, 11 px down) — a sense of depth, never a zoom.
 * The owner asked for exactly this much and no Ken Burns.
 *
 * rAF-eased toward the pointer so the move is soft; still under reduced
 * motion and on touch screens.
 */
export function Backdrop() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
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

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-page">
      <div
        ref={ref}
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
    </div>
  )
}
