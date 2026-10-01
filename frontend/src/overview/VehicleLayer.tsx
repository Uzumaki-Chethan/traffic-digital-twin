import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useSim } from '@/data/store'
import { useClockRate } from '@/data/useClockRate'
import { DisplayClock, motionBuffer, type MotionSide, type Pose } from '@/data/motion'
import { NET } from './plateGeometry'
import { BEACONS, isStalledVehicleId, shapeOf } from './vehicleTypes'

/**
 * The plate's traffic, drawn from the motion buffer (data/motion.ts).
 *
 * React only decides WHICH vehicles have an element (the ids in the
 * newest two frames, refreshed when a frame lands); where each one is
 * drawn is written to its transform attribute on every animation frame
 * by the loop below, sampling the buffer at the display clock's time.
 * No React render happens per frame, and no CSS transition is involved,
 * so there is nothing to finish early or restart late — the two things
 * that made the traffic hitch.
 *
 * SUMO reports the FRONT BUMPER, so the body is drawn half its length
 * back along its heading; the heading is SUMO's own angle, converted
 * from clockwise-from-north to the plate's clockwise-from-east frame
 * (y runs down the screen, so that is a plain −90°).
 */
export function VehicleLayer({ side, powered }: { side: MotionSide; powered: boolean }) {
  const buffer = motionBuffer(side)
  const reduced = useReducedMotion()
  // The steady clock rate (set speed, not the wobbling measurement).
  const rate = useClockRate()
  const smooth = useSim((s) => s.smooth)
  // Subscribing to the tick time is what re-renders this when a frame
  // lands, so the element set below follows the buffer.
  useSim((s) => s.tickSim)
  const els = useRef(new Map<string, SVGGElement>())
  // Only ever holds an entry or two — the stalled vehicles — so checking
  // it every frame costs nothing.
  const smokeEls = useRef(new Map<string, SVGGElement>())
  const clock = useRef(new DisplayClock())
  const poses = useRef(new Map<string, Pose>())
  const live = useRef({ rate, smooth })
  useEffect(() => {
    live.current = { rate, smooth }
  }, [rate, smooth])

  // The element set: an id keeps its element across frames, so a
  // vehicle is one <g> for its whole life on screen.
  const ids = powered ? buffer.ids() : []

  useEffect(() => {
    if (!powered) {
      clock.current.reset()
      return
    }
    let raf = 0
    const tick = (now: number) => {
      const tau = clock.current.advance(now, buffer, live.current.rate, live.current.smooth)
      if (tau !== null) {
        buffer.sample(tau, poses.current)
        for (const [id, el] of els.current) {
          const p = poses.current.get(id)
          const smoke = smokeEls.current.get(id)
          if (!p) {
            el.setAttribute('visibility', 'hidden')
            smoke?.setAttribute('visibility', 'hidden')
            continue
          }
          const half = shapeOf(p.type).length / 2
          // Plate frame: x east, y south; heading clockwise from east.
          const deg = p.angle - 90
          const rad = (deg * Math.PI) / 180
          const x = p.x - Math.cos(rad) * half
          const y = NET - p.y - Math.sin(rad) * half
          el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${deg.toFixed(1)})`)
          el.setAttribute('visibility', 'visible')
          el.setAttribute('opacity', p.speed > 0.3 ? '0.95' : '0.75')
          // Smoke only while actually stalled — not while it's still
          // driving toward its stop point, and not once it moves off
          // again at the end of its hold.
          smoke?.setAttribute('visibility', p.speed < 0.3 ? 'visible' : 'hidden')
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [buffer, powered, clock, els, smokeEls, live, poses])

  return (
    <g fill="var(--plate-vehicle)">
      {ids.map((id) => {
        // The type is static for a vehicle's life, and so is whether it's
        // the one stalled on its lane.
        const type = buffer.typeOf(id)
        const shape = shapeOf(type)
        const beacons = type ? BEACONS[type] : undefined
        const stalled = isStalledVehicleId(id)
        return (
          <g
            key={id}
            data-vid={id}
            data-ride={beacons || stalled ? 'no' : 'yes'}
            visibility="hidden"
            ref={(el) => {
              if (el) els.current.set(id, el)
              else els.current.delete(id)
            }}
          >
            <rect x={-shape.length / 2} y={-shape.width / 2} width={shape.length} height={shape.width} rx={0.3} />
            {beacons && (
              // The roof light bar, blinking: two lamps side by side just
              // behind the cab, each 0.6 m, one lit while the other is
              // dark. The one looping motion on the plate, by the owner's
              // choice: it is the signal a real light bar gives.
              <g className="beacons">
                <rect className="beacon-a" x={shape.length * 0.02} y={-0.85} width={0.8} height={0.75} fill={beacons[0]} />
                <rect className="beacon-b" x={shape.length * 0.02} y={0.1} width={0.8} height={0.75} fill={beacons[1]} />
              </g>
            )}
            {stalled && (
              // A static hazard marker over a stalled vehicle — the
              // scripted accident truck, or one stalled on demand — shown
              // for its whole time on screen, from the moment it enters
              // the route: it reads as "this one is in trouble" before it
              // has even stopped. No motion, so it needs no exception to
              // the no-looping-motion rule. The real road-sign triangle —
              // yellow, black rounded outline, black bar-and-dot — with
              // nothing behind it; only the shape is opaque.
              <g>
                <path
                  d="M 0 -2.6 L 1.9 1.3 L -1.9 1.3 Z"
                  fill="#FFC400"
                  stroke="#000"
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
                <rect x="-0.24" y="-1.5" width="0.48" height="1.7" rx="0.24" fill="#000" />
                <circle cx="0" cy="0.85" r="0.32" fill="#000" />
              </g>
            )}
            {stalled && (
              // Smoke, only once it has actually stalled (the tick loop
              // toggles this group's visibility on speed): five puffs
              // growing and fading on a loop, staggered so several
              // overlap at once for a real cloud rather than one faint
              // dot. In a top-down view "rising" reads as growing and
              // fading in place, not translating — smoke coming toward
              // the camera gets bigger, not sideways. A second
              // owner-approved exception layered on the first: this loop
              // reports "broken down right now", same reasoning as the
              // beacons and the rain.
              <g
                className="smoke"
                visibility="hidden"
                ref={(el) => {
                  if (el) smokeEls.current.set(id, el)
                  else smokeEls.current.delete(id)
                }}
              >
                {reduced ? (
                  // Steady under reduced motion, same convention as the
                  // beacons: a plain, larger cloud still says "stalled",
                  // without relying on the loop to say it.
                  <>
                    <circle cx={shape.length * 0.28} cy="-0.3" r="1.3" fill="#4a4a4a" opacity="0.5" />
                    <circle cx={shape.length * 0.28 + 0.9} cy="0.4" r="1.0" fill="#4a4a4a" opacity="0.4" />
                  </>
                ) : (
                  [
                    { delay: 0, dx: 0 },
                    { delay: 0.5, dx: 0.5 },
                    { delay: 1.0, dx: -0.4 },
                    { delay: 1.5, dx: 0.3 },
                    { delay: 2.0, dx: -0.6 },
                  ].map(({ delay, dx }) => (
                    <circle key={delay} cx={shape.length * 0.28 + dx} cy="0" r="0.4" fill="#4a4a4a" opacity="0">
                      <animate attributeName="r" values="0.4;2.6" dur="2.5s" begin={`${delay}s`} repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0;0.75;0" keyTimes="0;0.25;1" dur="2.5s" begin={`${delay}s`} repeatCount="indefinite" />
                    </circle>
                  ))
                )}
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}
