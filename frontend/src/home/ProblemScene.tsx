/**
 * "The problem" as a little story the scroll plays (Section 44):
 *  0 → 0.48  on a clock: East–West holds green on an empty road while
 *            cars pile up at red on the North–South road;
 *  0.48→0.55 the change: East–West amber, then red;
 *  0.55 → 1  with Trinetra: North–South goes green and the queue drains.
 * Pure function of `p` (0..1), so it scrubs both ways and has no timers.
 * Purely illustrative: the count shown is the cars drawn, nothing else.
 */

const N = 7
const CAR_COLOURS = ['#c9d2e3', '#ffcf5a', '#7fb2ff', '#e86a5a', '#a5e3b8', '#d6b8ff', '#f0f0f0']
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const ease = (x: number) => x * x * (3 - 2 * x)

type Lamp = 'red' | 'amber' | 'green'
const LAMP: Record<Lamp, string> = { red: '#ff3b30', amber: '#ffb020', green: '#34e27c' }

export function lampsAt(p: number): { ns: Lamp; ew: Lamp } {
  if (p < 0.48) return { ns: 'red', ew: 'green' }
  if (p < 0.55) return { ns: 'red', ew: 'amber' }
  return { ns: 'green', ew: 'red' }
}

/** One approach's queue: where car i is at progress p (0 = at its spot). */
export function carOffset(i: number, p: number) {
  const arrive = (i / N) * 0.42
  const inbound = 1 - ease(clamp((p - arrive) / 0.07)) // 1 = still far away, 0 = in the queue
  const depart = 0.56 + i * 0.04
  const outbound = ease(clamp((p - depart) / 0.14)) // 0 = waiting, 1 = gone through
  return { inbound, outbound, waiting: inbound < 0.05 && outbound === 0 }
}

/** The south arm runs a beat behind the north, so the two queues don't move as one. */
const ARM_LAG = { n: 0, s: 0.015 } as const

/** Cars standing in a queue at progress p, both arms together. */
export function waitingAt(p: number) {
  let n = 0
  for (const arm of ['n', 's'] as const) for (let i = 0; i < N; i++) if (carOffset(i, p + ARM_LAG[arm]).waiting) n++
  return n
}

function Signal({ x, y, lamp, label }: { x: number; y: number; lamp: Lamp; label: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-11} y={-30} width={22} height={60} rx={7} fill="#0b0e15" stroke="#2a3346" />
      {(['red', 'amber', 'green'] as const).map((l, i) => (
        <circle
          key={l}
          cx={0}
          cy={-18 + i * 18}
          r={6.5}
          fill={lamp === l ? LAMP[l] : '#1b1f28'}
          style={{ filter: lamp === l ? `drop-shadow(0 0 6px ${LAMP[l]})` : undefined, transition: 'fill .25s' }}
        />
      ))}
      <text x={0} y={46} textAnchor="middle" className="ps-sig-label">
        {label}
      </text>
    </g>
  )
}

export function ProblemScene({ p }: { p: number }) {
  const { ns, ew } = lampsAt(p)
  const trinetra = p >= 0.5
  const waiting = waitingAt(p)
  const cars: React.ReactNode[] = []
  // North arm: southbound cars on the west lane (right-hand traffic), stop line at y=150
  // South arm: northbound cars on the east lane, stop line at y=250
  for (const arm of ['n', 's'] as const) {
    for (let i = 0; i < N; i++) {
      const { inbound, outbound, waiting: w } = carOffset(i, p + ARM_LAG[arm])
      const spot = arm === 'n' ? 150 - 22 - i * 21 : 250 + 4 + i * 21
      const dir = arm === 'n' ? 1 : -1
      const y = spot - dir * inbound * 260 + dir * outbound * (420 + i * 24)
      if (y < -40 || y > 440) continue
      const x = arm === 'n' ? 178 : 208
      cars.push(
        <g key={arm + i} transform={`translate(${x} ${y})`}>
          <rect width={14} height={18} rx={3.5} fill={CAR_COLOURS[(i + (arm === 's' ? 3 : 0)) % CAR_COLOURS.length]} />
          <rect x={2} y={arm === 'n' ? 11 : 3} width={10} height={4} rx={1} fill="#0b0e15" opacity={0.55} />
          {/* tail-lights glow while it waits */}
          {w && <rect x={1} y={arm === 'n' ? 0 : 16} width={12} height={2} rx={1} fill="#ff3b30" style={{ filter: 'drop-shadow(0 0 3px #ff3b30)' }} />}
        </g>,
      )
    }
  }
  const emptyGreen = ew === 'green'
  return (
    <div className="problem-scene" aria-hidden>
      <svg viewBox="0 0 400 400" className="ps-svg">
        <defs>
          <pattern id="ps-zebra" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="3" height="6" fill="rgb(255 255 255 / 0.35)" />
          </pattern>
          <radialGradient id="ps-glow-g">
            <stop offset="0" stopColor="#34e27c" stopOpacity="0.35" />
            <stop offset="1" stopColor="#34e27c" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* roads */}
        <rect x={0} y={170} width={400} height={60} fill="#1a2132" />
        <rect x={170} y={0} width={60} height={400} fill="#1a2132" />
        <line x1={0} y1={200} x2={170} y2={200} stroke="#ffb020" strokeOpacity={0.35} strokeDasharray="8 8" />
        <line x1={230} y1={200} x2={400} y2={200} stroke="#ffb020" strokeOpacity={0.35} strokeDasharray="8 8" />
        <line x1={200} y1={0} x2={200} y2={170} stroke="#ffb020" strokeOpacity={0.35} strokeDasharray="8 8" />
        <line x1={200} y1={230} x2={200} y2={400} stroke="#ffb020" strokeOpacity={0.35} strokeDasharray="8 8" />
        {/* stop lines */}
        <rect x={172} y={150} width={27} height={4} fill="#e9eef8" opacity={0.7} />
        <rect x={201} y={246} width={27} height={4} fill="#e9eef8" opacity={0.7} />
        <rect x={150} y={201} width={4} height={27} fill="#e9eef8" opacity={0.7} />
        <rect x={246} y={172} width={4} height={27} fill="#e9eef8" opacity={0.7} />
        {/* the wasted green: a glow over an empty road */}
        <g style={{ opacity: emptyGreen ? 1 : 0, transition: 'opacity .4s' }}>
          <ellipse cx={80} cy={200} rx={90} ry={34} fill="url(#ps-glow-g)" />
          <ellipse cx={320} cy={200} rx={90} ry={34} fill="url(#ps-glow-g)" />
          <text x={80} y={204} textAnchor="middle" className="ps-empty">
            green · nobody here
          </text>
          <text x={320} y={204} textAnchor="middle" className="ps-empty">
            green · nobody here
          </text>
        </g>
        {cars}
        <Signal x={140} y={118} lamp={ns} label="N–S" />
        <Signal x={262} y={282} lamp={ns} label="N–S" />
        <Signal x={118} y={262} lamp={ew} label="E–W" />
        <Signal x={282} y={118} lamp={ew} label="E–W" />
      </svg>
      <div className="ps-bar">
        <div className="ps-mode">
          <span className={trinetra ? '' : 'on'}>On a clock</span>
          <span className={trinetra ? 'on t' : ''}>With Trinetra</span>
        </div>
        <div className={`ps-count ${trinetra && waiting === 0 ? 'ok' : waiting > 6 ? 'bad' : ''}`}>
          {trinetra && waiting === 0 ? (
            'Queue cleared'
          ) : (
            <>
              <b>{waiting}</b> {waiting === 1 ? 'car' : 'cars'} {trinetra ? 'still to clear' : 'waiting at red'}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
