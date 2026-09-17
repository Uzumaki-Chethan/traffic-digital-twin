import { useEffect, useRef } from 'react'
import { useSim } from '@/data/store'
import { DisplayClock, motionBuffer, type MotionSide, type Pose } from '@/data/motion'
import { NET } from './plateGeometry'
import { shapeOf } from './vehicleTypes'

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
  const rate = useSim((s) => s.rate)
  const smooth = useSim((s) => s.smooth)
  // Subscribing to the tick time is what re-renders this when a frame
  // lands, so the element set below follows the buffer.
  useSim((s) => s.tickSim)
  const els = useRef(new Map<string, SVGGElement>())
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
          if (!p) {
            el.setAttribute('visibility', 'hidden')
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
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [buffer, powered, clock, els, live, poses])

  return (
    <g fill="var(--plate-vehicle)">
      {ids.map((id) => {
        // The type is static for a vehicle's life.
        const shape = shapeOf(buffer.typeOf(id))
        return (
          <g
            key={id}
            visibility="hidden"
            ref={(el) => {
              if (el) els.current.set(id, el)
              else els.current.delete(id)
            }}
          >
            <rect x={-shape.length / 2} y={-shape.width / 2} width={shape.length} height={shape.width} rx={0.3} />
          </g>
        )
      })}
    </g>
  )
}
