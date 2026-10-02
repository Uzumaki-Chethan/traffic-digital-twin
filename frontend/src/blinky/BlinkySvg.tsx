import { useEffect, useRef, type MutableRefObject } from 'react'
import { moodColour, type RigPose } from './model'

/**
 * Zen in 2D, for when WebGL is unavailable. Same canvas geometry as
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
  // viewBox 0..180: feet at (90,140) = (0.9s,1.4s) when rendered at 1.8s px;
  // the figure is 100 units tall (Zen's hat tip near y = 40)
  return (
    <svg viewBox="0 0 180 180" width={1.8 * size} height={1.8 * size} className="pointer-events-none absolute inset-0" aria-hidden>
      <defs>
        <radialGradient id="zen-aura">
          <stop offset="0" stopColor="#ffd27a" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffb030" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="90" cy="140" rx="34" ry="8" fill="url(#zen-aura)" />
      <g ref={g}>
        {/* robe: charcoal outer over an ivory inner, gold hem */}
        <path d="M74 100 L62 132 L118 132 L106 100 Z" fill="#23201d" stroke="#d9a441" strokeWidth="1.5" />
        <path d="M84 100 L80 131 L100 131 L96 100 Z" fill="#efe6d2" />
        <circle cx="90" cy="116" r="3.5" fill="#ffd27a" />
        {/* scarf */}
        <path d="M76 100 Q90 106 104 100 L102 96 Q90 101 78 96 Z" fill="#f2c457" />
        {/* head, face screen and gold eyes */}
        <ellipse cx="90" cy="84" rx="21" ry="18" fill="#f5f1e8" />
        <ellipse cx="90" cy="86" rx="16" ry="12" fill="#060608" />
        {[83, 97].map((cx, i) => (
          <ellipse key={cx} ref={(el) => { if (el) eyes.current[i] = el }} cx={cx} cy="86" rx="3.4" ry="4" fill="#ffd27a" />
        ))}
        {/* antennas with gold tips */}
        {[-1, 1].map((d) => (
          <g key={d}>
            <line x1={90 + d * 21} y1="82" x2={90 + d * 30} y2="64" stroke="#d9a441" strokeWidth="1.6" />
            <circle ref={(el) => { if (el) lamps.current[d < 0 ? 0 : 1] = el }} cx={90 + d * 30} cy="63" r="2.8" fill="#ffd27a" />
          </g>
        ))}
        {/* conical hat with a charcoal band and a gold brim */}
        <path d="M90 40 L131 72 Q90 77 49 72 Z" fill="#e2cf9e" stroke="#d9a441" strokeWidth="1.6" />
        <path d="M70 56 L110 56 L118 62 Q90 66 62 62 Z" fill="#23201d" />
        <circle cx="90" cy="41" r="2.4" fill="#060608" />
      </g>
    </svg>
  )
}
