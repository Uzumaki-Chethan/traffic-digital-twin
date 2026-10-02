import { useEffect, useRef, type MutableRefObject } from 'react'
import { moodColour, type RigPose } from './model'

/**
 * Sparky in 2D, for when WebGL is unavailable. Same canvas geometry as
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
  // the figure is 100 units tall (Sparky's antenna tips near y = 40)
  return (
    <svg viewBox="0 0 180 180" width={1.8 * size} height={1.8 * size} className="pointer-events-none absolute inset-0" aria-hidden>
      <defs>
        <radialGradient id="sparky-flame">
          <stop offset="0" stopColor="#ffe0b0" />
          <stop offset="1" stopColor="#ff3a10" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g ref={g}>
        {/* thruster flames */}
        <ellipse cx="82" cy="140" rx="4" ry="9" fill="url(#sparky-flame)" />
        <ellipse cx="98" cy="140" rx="4" ry="9" fill="url(#sparky-flame)" />
        {/* legs and boots */}
        <rect x="76" y="114" width="12" height="18" rx="5" fill="#f3f1ee" stroke="#141416" strokeWidth="1" />
        <rect x="92" y="114" width="12" height="18" rx="5" fill="#f3f1ee" stroke="#141416" strokeWidth="1" />
        {/* body and the glowing triangle core */}
        <ellipse cx="90" cy="104" rx="16" ry="15" fill="#f3f1ee" />
        <path d="M84 100 L96 100 L90 110 Z" fill="none" stroke="#ff5a34" strokeWidth="2" strokeLinejoin="round" />
        {/* red scarf */}
        <path d="M76 90 Q90 96 104 90 L102 86 Q90 91 78 86 Z" fill="#e0201a" />
        <path d="M78 88 Q66 92 60 102 Q70 96 80 92 Z" fill="#ff3a1c" />
        {/* head, ear pods, black visor and red eyes */}
        <circle cx="68" cy="70" r="5" fill="#e0201a" />
        <circle cx="112" cy="70" r="5" fill="#e0201a" />
        <ellipse cx="90" cy="70" rx="22" ry="20" fill="#f3f1ee" />
        <ellipse cx="90" cy="72" rx="17" ry="13" fill="#020202" />
        {[83, 97].map((cx, i) => (
          <ellipse key={cx} ref={(el) => { if (el) eyes.current[i] = el }} cx={cx} cy="71" rx="3.4" ry="4" fill="#ff6a3c" />
        ))}
        {/* antennas with glowing red tips */}
        {[-1, 1].map((d) => (
          <g key={d}>
            <line x1={90 + d * 9} y1="52" x2={90 + d * 13} y2="44" stroke="#141416" strokeWidth="1.6" />
            <circle ref={(el) => { if (el) lamps.current[d < 0 ? 0 : 1] = el }} cx={90 + d * 13} cy="42" r="3" fill="#ff3a1c" />
          </g>
        ))}
      </g>
    </svg>
  )
}
