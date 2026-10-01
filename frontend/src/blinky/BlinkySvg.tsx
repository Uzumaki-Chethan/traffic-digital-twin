import { useEffect, useRef, type MutableRefObject } from 'react'
import { moodColour, type RigPose } from './model'

/**
 * Blinky in 2D, for when WebGL is unavailable. Same canvas geometry as
 * Blinky3D (feet at 0.9s,1.4s; ball at 0.9s,0.46s) and the same pose ref;
 * it animates by writing attributes from its own rAF.
 */
export function BlinkySvg({ poseRef, size }: { poseRef: MutableRefObject<RigPose>; size: number }) {
  const g = useRef<SVGGElement>(null)
  const lamps = useRef<SVGCircleElement[]>([])
  const eyes = useRef<SVGEllipseElement[]>([])
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const p = poseRef.current
      const c = moodColour(p.mood, p.t)
      lamps.current.forEach((l) => l?.setAttribute('fill', c))
      const closed = p.anim === 'sleep'
      eyes.current.forEach((e) => e?.setAttribute('ry', closed ? '0.6' : '4'))
      g.current?.setAttribute(
        'transform',
        `translate(90 140) rotate(${p.tilt}) scale(${p.scale / Math.sqrt(p.squash)} ${p.scale * p.squash}) translate(-90 -140)`,
      )
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [poseRef])
  // viewBox 0..180: feet at (90,140) = (0.9s,1.4s) when rendered at 1.8s px
  return (
    <svg viewBox="0 0 180 180" width={1.8 * size} height={1.8 * size} className="pointer-events-none absolute inset-0" aria-hidden>
      <g ref={g}>
        <line x1="90" y1="62" x2="90" y2="50" stroke="#c9d2de" strokeWidth="2" />
        <circle cx="90" cy="46" r="4.5" fill="#ffb020" />
        <rect x="70" y="62" width="40" height="64" rx="12" fill="#1c2433" stroke="#d5dde8" strokeWidth="2" />
        {[78, 95, 112].map((cy, i) => (
          <circle key={cy} ref={(el) => { if (el) lamps.current[i] = el }} cx="90" cy={cy} r={[10, 7.5, 6][i]} fill="#2af28e" />
        ))}
        {[86, 94].map((cx, i) => (
          <ellipse key={cx} ref={(el) => { if (el) eyes.current[i] = el }} cx={cx} cy="79" rx="3" ry="4" fill="#fff" />
        ))}
        <rect x="76" y="126" width="11" height="14" rx="4" fill="#1c2433" />
        <rect x="93" y="126" width="11" height="14" rx="4" fill="#1c2433" />
      </g>
    </svg>
  )
}
