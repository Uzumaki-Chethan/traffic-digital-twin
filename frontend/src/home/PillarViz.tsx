import { useEffect, useState } from 'react'

/**
 * The three pillars' little pictures (Section 44). Illustrations of what
 * each ability does — not data: no numbers on them, nothing measured.
 */

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Sees: a sweep passing over the junction, picking out the vehicles. */
export function SeesViz() {
  const dots = [
    [30, 52],
    [38, 50],
    [46, 48],
    [52, 30],
    [52, 22],
    [66, 52],
    [74, 50],
    [48, 70],
    [48, 80],
  ]
  return (
    <div className="pv pv-sees" aria-hidden>
      <svg viewBox="0 0 100 100">
        <rect x={0} y={44} width={100} height={12} fill="rgb(255 255 255 / 0.06)" />
        <rect x={44} y={0} width={12} height={100} fill="rgb(255 255 255 / 0.06)" />
        {[16, 30, 44].map((r) => (
          <circle key={r} cx={50} cy={50} r={r} fill="none" stroke="rgb(255 59 48 / 0.25)" strokeWidth={0.6} />
        ))}
        {dots.map(([x, y], i) => {
          // light each dot as the sweep (one turn per 3 s, clockwise from north) passes it
          const ang = (Math.atan2(x - 50, -(y - 50)) * 180) / Math.PI
          const delay = (((ang + 360) % 360) / 360) * 3
          return <circle key={i} cx={x} cy={y} r={2.4} className="pv-dot" style={{ animationDelay: `${delay - 3}s` }} />
        })}
      </svg>
      <span className="pv-sweep" />
    </div>
  )
}

/** Predicts: what happened (solid) and what is coming (dashed, with its band). */
export function PredictsViz() {
  return (
    <div className="pv pv-predicts" aria-hidden>
      <svg viewBox="0 0 200 100" preserveAspectRatio="none">
        <path d="M120 58 C140 50 160 34 196 24 L196 46 C160 54 140 64 120 66 Z" fill="rgb(255 176 32 / 0.16)" />
        <path className="pv-past" d="M4 78 C20 74 30 80 44 70 S70 66 84 62 S108 64 120 62" fill="none" stroke="#ffb020" strokeWidth={2.4} strokeLinecap="round" />
        <path className="pv-next" d="M120 62 C140 55 160 42 196 35" fill="none" stroke="#ffd166" strokeWidth={2.4} strokeDasharray="5 5" strokeLinecap="round" />
        <line x1={120} y1={8} x2={120} y2={94} stroke="rgb(255 255 255 / 0.35)" strokeWidth={1} strokeDasharray="2 3" />
      </svg>
      <span className="pv-now">now</span>
      <span className="pv-ahead">+15 s</span>
    </div>
  )
}

const PHASES = ['North', 'East', 'South', 'West']
function draw() {
  return PHASES.map(() => 0.2 + Math.random() * 0.8)
}

/** Decides: every phase scored, the best one given the green. */
export function DecidesViz() {
  const [scores, setScores] = useState([0.55, 0.9, 0.35, 0.6])
  useEffect(() => {
    if (reduced()) return
    const id = window.setInterval(() => setScores(draw()), 1800)
    return () => window.clearInterval(id)
  }, [])
  const best = scores.indexOf(Math.max(...scores))
  return (
    <div className="pv pv-decides" aria-hidden>
      {scores.map((s, i) => (
        <div key={PHASES[i]} className={`pv-bar ${i === best ? 'win' : ''}`}>
          <span className="pv-fill" style={{ transform: `scaleY(${s})` }} />
          <em>{PHASES[i]}</em>
        </div>
      ))}
    </div>
  )
}
