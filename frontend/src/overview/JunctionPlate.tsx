import { memo, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { LaneView, VehicleView } from '@/data/types'
import { useSim } from '@/data/store'
import { lampOf, lampLit, lampColor, isPermissive, laneLabel } from '@/utils/signal'
import type { Arm } from './junctionTopology'
import {
  APPROACH_NAMES,
  ARM_RECTS,
  CENTRE,
  JUNCTION_HALF,
  KERB_R,
  LANE_W,
  LANES,
  NET,
  ROAD_HALF,
  arrowPath,
  junctionOutline,
  laneTransform,
  stopLinePoint,
  type LaneGeom,
} from './plateGeometry'
import { VehicleLayer } from './VehicleLayer'
import { BUILDINGS, CITY_EXTENT, SIDEWALK_OUT, TREES, canopyTone, roofTone } from './cityscape'
import type { MotionSide } from '@/data/motion'
import { DUR, EASE_OUT } from '@/ui/motion'

interface Props {
  lanes: LaneView[]
  emergencyLanes: string[]
  /** Real vehicles from the snapshot, at their SUMO coordinates. Kept
   * for the summary; the traffic itself is drawn from data/motion.ts. */
  vehicles?: VehicleView[]
  /** Which motion buffer this plate draws: the demo, or one side of an evaluation. */
  motionSide?: MotionSide
  /** Unpowered: heads dark, no traffic — the pre-simulation state. */
  powered: boolean
  /** Pan/zoom window in metres, from usePanZoom. */
  viewBox: string
  /** Screen pixels per metre at the current zoom, from usePanZoom.
   * Labels, signal heads and the north arrow are drawn at a constant
   * pixel size. */
  pxPerMetre: number
  /** Identity of the phase being served (utils/signal.phaseKey). When it
   * changes, the release plays once on the lanes that just went green. */
  releaseKey?: number
  /** True only while the running scenario is Rain (data/pageContext.ts).
   * Draws falling streaks over the whole plate — the one other exception
   * to "no looping motion in the periphery" (the emergency beacons are
   * the first), because it is reporting the sim's own weather rather than
   * decorating the page. Steady under reduced motion. */
  raining?: boolean
  /** The four approach-name pills (the twin's labels tool). */
  showLabels?: boolean
}

/** The stop line is the junction edge; the crossing band lies just inside it. */
const CROSSING_IN = 0.6
const CROSSING_W = 3

/** Fixed order, so the four names are never re-keyed by object iteration. */
const APPROACH_ORDER: Arm[] = ['N', 'S', 'W', 'E']

/** A signal head needs its lane about this wide on screen to be worth drawing. */
const MIN_LANE_PX = 8

/**
 * The hero. A top-down map of junction C at true scale — one SVG unit is
 * one metre, the geometry is the network's own (plateGeometry) — drawn
 * in signal-plan convention: hairline kerbs, dashed lane dividers, solid
 * stop bars, painted movement arrows, a three-lamp head at every stop
 * bar. Lane fill = that lane's own live signal; each vehicle is drawn at
 * its real length and width, so a queue looks exactly as it does in
 * sumo-gui. One channel per variable.
 */
export function JunctionPlate({
  lanes,
  emergencyLanes,
  vehicles: _vehicles,
  motionSide = 'demo',
  powered,
  viewBox,
  pxPerMetre,
  releaseKey = 0,
  raining = false,
  showLabels = true,
}: Props) {
  const hoverLane = useSim((s) => s.hoverLane)
  const setHoverLane = useSim((s) => s.setHoverLane)
  const byId = useMemo(() => Object.fromEntries(lanes.map((l) => [l.lane_id, l])), [lanes])
  const emergency = useMemo(() => new Set(emergencyLanes), [emergencyLanes])
  const reduced = useReducedMotion()
  // The release plays while the phase is young, keyed on the phase's own
  // identity so it runs once per switch (see utils/signal.phaseKey).
  const release = powered && !reduced ? releaseKey : 0
  // Screen-space scale: inside a group scaled by this, one unit is one pixel.
  const px = 1 / Math.max(pxPerMetre, 1e-6)
  const laneDetail = LANE_W * pxPerMetre >= MIN_LANE_PX

  const vb = useMemo(() => {
    const [x, y, w, h] = viewBox.split(' ').map(Number)
    return { x, y, w, h }
  }, [viewBox])

  const a = CENTRE - JUNCTION_HALF // 178.4
  const b = CENTRE + JUNCTION_HALF // 221.6
  const lo = CENTRE - ROAD_HALF // 190.4
  const hi = CENTRE + ROAD_HALF // 209.6

  return (
    <svg viewBox={viewBox} className="h-full w-full select-none" role="img" aria-label={plateSummary(lanes, powered)}>
      <defs>
        {/* The box junction's yellow cross-hatch, as painted on a real one. */}
        <pattern id="boxHatch" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3.2" stroke="var(--plate-centre)" strokeWidth="0.28" />
          <line x1="0" y1="0" x2="3.2" y2="0" stroke="var(--plate-centre)" strokeWidth="0.28" />
        </pattern>
        <pattern id="alertHatch" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.6" stroke="var(--alert)" strokeWidth="0.4" />
        </pattern>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="1.6" markerHeight="1.6" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="var(--plate-marking)" />
        </marker>
        {/* One rain streak tile, 5 x 10 m, with a slight wind-slant. The
            overlay rect below is translated by exactly one tile height per
            loop, which is what makes the fall seamless. */}
        <pattern id="rainStreaks" width="5" height="10" patternUnits="userSpaceOnUse">
          <line x1="0.5" y1="0" x2="0" y2="4" stroke="#cfe0ee" strokeWidth="0.22" />
          <line x1="3" y1="5" x2="2.5" y2="9" stroke="#cfe0ee" strokeWidth="0.22" />
        </pattern>
      </defs>

      {/* ground, well past the network so a wide window shows land, not card */}
      <rect x={-NET * 4} y={-NET * 4} width={NET * 9} height={NET * 9} fill="var(--plate-ground)" />

      {/* sidewalks along every arm, and the paved corners round the box */}
      <g fill="var(--plate-sidewalk)">
        <rect x={CENTRE - SIDEWALK_OUT} y={-CITY_EXTENT} width={SIDEWALK_OUT * 2} height={NET + CITY_EXTENT * 2} />
        <rect x={-CITY_EXTENT} y={CENTRE - SIDEWALK_OUT} width={NET + CITY_EXTENT * 2} height={SIDEWALK_OUT * 2} />
        <rect x={a - 4} y={a - 4} width={b - a + 8} height={b - a + 8} rx={6} />
      </g>

      <CityLayer />

      {/* carriageways and the junction, exactly the network's shapes */}
      {ARM_RECTS.map(([x, y, w, h]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} fill="var(--plate-road)" />
      ))}
      <path d={junctionOutline()} fill="var(--plate-road)" />

      {/* kerb edge lines: each corner is arm edge -> 12 m fillet -> arm edge */}
      <g fill="none" stroke="var(--plate-kerb)" strokeWidth="1.5" vectorEffect="non-scaling-stroke">
        <path d={`M ${hi} 0 L ${hi} ${a} A ${KERB_R} ${KERB_R} 0 0 0 ${b} ${lo} L ${NET} ${lo}`} vectorEffect="non-scaling-stroke" />
        <path d={`M ${NET} ${hi} L ${b} ${hi} A ${KERB_R} ${KERB_R} 0 0 0 ${hi} ${b} L ${hi} ${NET}`} vectorEffect="non-scaling-stroke" />
        <path d={`M ${lo} ${NET} L ${lo} ${b} A ${KERB_R} ${KERB_R} 0 0 0 ${a} ${hi} L 0 ${hi}`} vectorEffect="non-scaling-stroke" />
        <path d={`M 0 ${lo} L ${a} ${lo} A ${KERB_R} ${KERB_R} 0 0 0 ${lo} ${a} L ${lo} 0`} vectorEffect="non-scaling-stroke" />
      </g>

      {/* junction box — hatched, dashed boundary, as on a signal plan */}
      <path d={junctionOutline()} fill="url(#boxHatch)" stroke="var(--plate-centre)" strokeWidth="0.35" opacity="0.85" />

      {/* pedestrian crossings: zebra bars in a 3 m band just inside each stop line */}
      <g fill="var(--plate-marking)" opacity="0.92">
        {zebra(lo, hi, a + CROSSING_IN, 'h')}
        {zebra(lo, hi, b - CROSSING_IN - CROSSING_W, 'h')}
        {zebra(lo, hi, a + CROSSING_IN, 'v')}
        {zebra(lo, hi, b - CROSSING_IN - CROSSING_W, 'v')}
      </g>

      {/* centre lines — double yellow, 0.15 m each */}
      <g stroke="var(--plate-centre)" strokeWidth="0.15">
        {[-0.22, 0.22].map((o) => (
          <g key={o}>
            <line x1={CENTRE + o} y1={0} x2={CENTRE + o} y2={a} />
            <line x1={CENTRE + o} y1={b} x2={CENTRE + o} y2={NET} />
            <line x1={0} y1={CENTRE + o} x2={a} y2={CENTRE + o} />
            <line x1={b} y1={CENTRE + o} x2={NET} y2={CENTRE + o} />
          </g>
        ))}
      </g>

      {/* lane dividers — 3 m dash, 3 m gap; inbound stronger than outbound */}
      <g stroke="var(--plate-lane)" strokeWidth="0.18" fill="none" strokeDasharray="3 3">
        {[LANE_W, 2 * LANE_W].map((d) => (
          <g key={d}>
            {/* inbound: N east of centre, S west, W north (-y), E south (+y) */}
            <line x1={CENTRE + d} y1={0} x2={CENTRE + d} y2={a} opacity="0.85" />
            <line x1={CENTRE - d} y1={b} x2={CENTRE - d} y2={NET} opacity="0.85" />
            <line x1={0} y1={CENTRE - d} x2={a} y2={CENTRE - d} opacity="0.85" />
            <line x1={b} y1={CENTRE + d} x2={NET} y2={CENTRE + d} opacity="0.85" />
            {/* outbound */}
            <line x1={CENTRE - d} y1={0} x2={CENTRE - d} y2={a} opacity="0.4" />
            <line x1={CENTRE + d} y1={b} x2={CENTRE + d} y2={NET} opacity="0.4" />
            <line x1={0} y1={CENTRE + d} x2={a} y2={CENTRE + d} opacity="0.4" />
            <line x1={b} y1={CENTRE - d} x2={NET} y2={CENTRE - d} opacity="0.4" />
          </g>
        ))}
      </g>

      {/* per-lane live layer: fill, hover, stop bar */}
      {LANES.map((g) => (
        <Lane
          key={g.id}
          g={g}
          lane={byId[g.id]}
          powered={powered}
          emergency={emergency.has(g.id)}
          hovered={hoverLane === g.id}
          dimmed={hoverLane !== null && hoverLane !== g.id}
          onHover={setHoverLane}
        />
      ))}

      {/* painted movement arrows, in the lane's own frame */}
      <g fill="none" stroke="var(--plate-marking)" strokeWidth="0.35" opacity="0.9" markerEnd="url(#arrowhead)">
        {LANES.map((g) => (
          <path key={g.id} d={arrowPath(g.index)} transform={laneTransform(g)} />
        ))}
      </g>

      {/* THE RELEASE. On the confirmed green, light runs once along the
          painted arrow in the direction of travel — drawn as the path's
          own length, so it tracks the turn instead of crossing it. This
          is the one choreographed moment in the product: it says "this
          movement has just been given the junction", which is the single
          thing the whole system exists to decide. It does not loop, and a
          switch arriving mid-sweep replaces the element rather than
          waiting for it. */}
      {release !== 0 && (
        <g fill="none" strokeLinecap="round">
          {LANES.map((g) => {
            const lane = byId[g.id]
            if (!lane || lampOf(lane.signal) !== 'green') return null
            return (
              <motion.path
                key={`${g.id}-${release}`}
                d={arrowPath(g.index)}
                transform={laneTransform(g)}
                stroke="var(--lamp-green)"
                strokeWidth={0.9}
                initial={{ pathLength: 0, pathOffset: 0, opacity: 0.95 }}
                animate={{ pathLength: [0, 0.55, 0], pathOffset: [0, 0.3, 1], opacity: [0.95, 0.95, 0] }}
                transition={{ duration: DUR.phase, ease: EASE_OUT, times: [0, 0.55, 1] }}
              />
            )
          })}
        </g>
      )}

      {/* Approach names, pinned to the edges of the CURRENT window rather
          than to the ends of the arms — at the default junction framing
          the arm ends are off screen, which left the plate with no
          orientation label at all except the compass. Each sits on the
          verge beside its own inbound carriageway, so it names the side
          the traffic arrives from. */}
      <g fontFamily="var(--font-ui)" fontSize="12" fontWeight="600" display={showLabels ? undefined : 'none'}>
        {APPROACH_ORDER.map((arm) => {
          // White pills on each road's own line at the window's edge,
          // the way a map labels a road.
          const inset = 20 * px
          const w = APPROACH_NAMES[arm].length * 7.4 + 20
          const x = arm === 'W' ? vb.x + inset + (w / 2) * px : arm === 'E' ? vb.x + vb.w - inset - (w / 2) * px : CENTRE
          const y = arm === 'N' ? vb.y + inset : arm === 'S' ? vb.y + vb.h - inset : CENTRE
          return (
            <g key={arm} transform={`translate(${x} ${y}) scale(${px})`}>
              <rect x={-w / 2} y={-11} width={w} height={22} rx={11} fill="#fff" opacity="0.96" style={{ filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 0.25))' }} />
              <text textAnchor="middle" dominantBaseline="central" fill="var(--plate-ink)">
                {APPROACH_NAMES[arm]}
              </text>
            </g>
          )
        })}
      </g>

      {/* Real vehicles at their real size, from the motion buffer: one
          element per vehicle, its transform written every animation
          frame at the display clock's time (see VehicleLayer). Size
          carries the vehicle type; colour is left alone because on this
          plate colour already means signal state. */}
      <VehicleLayer side={motionSide} powered={powered} />

      {/* north arrow, pinned to the window's bottom-right, above the zoom pills */}
      <g transform={`translate(${vb.x + vb.w} ${vb.y + vb.h}) scale(${px}) translate(-33 -78)`}>
        <circle r="14" fill="#fff" stroke="rgb(27 37 54 / 0.25)" strokeWidth="1" style={{ filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 0.25))' }} />
        <path d="M 0 -11 L -4 0 L 4 0 Z" fill="#E5484D" />
        <path d="M 0 11 L -4 0 L 4 0 Z" fill="#2F6BFF" />
        <text y="-19" textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="var(--font-num)" fill="var(--plate-ink)">
          N
        </text>
      </g>

      {/* signal heads, above the traffic, at a constant pixel size */}
      {laneDetail &&
        LANES.map((g) => {
          const lane = byId[g.id]
          const lamp = powered && lane ? lampOf(lane.signal) : 'off'
          return (
            <SignalHead
              key={g.id}
              g={g}
              lamp={lamp}
              px={px}
              bloom={release !== 0 && lamp === 'green' ? release : undefined}
            />
          )
        })}

      {/* Rain, reporting the sim's own weather (the Rain scenario), not
          decorating the page — drawn last so it falls over everything,
          the way it would over a real photograph of the junction. */}
      {raining && (
        <rect
          className={reduced ? undefined : 'rain-fall'}
          x={-NET * 4}
          y={-NET * 4}
          width={NET * 9}
          height={NET * 9}
          fill="url(#rainStreaks)"
          opacity="0.4"
          pointerEvents="none"
        />
      )}
    </svg>
  )
}

function Lane({
  g,
  lane,
  powered,
  emergency,
  hovered,
  dimmed,
  onHover,
}: {
  g: LaneGeom
  lane: LaneView | undefined
  powered: boolean
  emergency: boolean
  hovered: boolean
  dimmed: boolean
  onHover: (id: string | null) => void
}) {
  const lamp = powered && lane ? lampOf(lane.signal) : 'off'
  const permissive = !!lane && isPermissive(lane.signal)

  const v = g.axis === 'v'
  const laneRect = v
    ? { x: g.lo, y: Math.min(g.outer, g.stop), w: g.hi - g.lo, h: Math.abs(g.stop - g.outer) }
    : { x: Math.min(g.outer, g.stop), y: g.lo, w: Math.abs(g.stop - g.outer), h: g.hi - g.lo }
  const barColour = lamp === 'off' ? 'var(--plate-kerb)' : lampColor(lamp)

  return (
    <g
      opacity={dimmed ? 0.55 : 1}
      onMouseEnter={() => onHover(g.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'default', transition: 'opacity var(--dur-fast) var(--ease-out)' }}
    >
      {/* fill = this lane's own signal state */}
      <rect
        x={laneRect.x}
        y={laneRect.y}
        width={laneRect.w}
        height={laneRect.h}
        fill={lamp === 'off' ? 'transparent' : lampColor(lamp)}
        style={{
          opacity: lamp === 'off' ? 0 : hovered ? 'calc(var(--plate-fill-alpha) * 1.6)' : 'var(--plate-fill-alpha)',
          transition: 'opacity var(--dur-value) var(--ease-out)',
        }}
      />
      {emergency && <rect x={laneRect.x} y={laneRect.y} width={laneRect.w} height={laneRect.h} fill="url(#alertHatch)" opacity="0.5" />}
      {hovered && (
        <rect
          x={laneRect.x}
          y={laneRect.y}
          width={laneRect.w}
          height={laneRect.h}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* stop bar — solid, in the lane's signal colour, always 3 px */}
      {v ? (
        <line x1={g.lo} y1={g.stop} x2={g.hi} y2={g.stop} stroke={barColour} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeDasharray={permissive ? '0.8 0.4' : undefined} />
      ) : (
        <line x1={g.stop} y1={g.lo} x2={g.stop} y2={g.hi} stroke={barColour} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeDasharray={permissive ? '0.8 0.4' : undefined} />
      )}
    </g>
  )
}

/**
 * Three lamps in a housing at the stop bar, drawn in screen pixels so it
 * reads the same at any zoom. Unlit lamps stay visible — a real head
 * shows all three lenses — so position, not just hue, says which is lit.
 * It stands on the junction side of the line, red nearest the driver.
 *
 * `bloom` is the release token from useSignalMoment: when it changes, a
 * ring expands out of the green lens once and fades. A lamp coming on is
 * the most important state change on the screen and it was previously
 * indistinguishable from any other repaint.
 */
function SignalHead({
  g,
  lamp,
  px,
  bloom,
}: {
  g: LaneGeom
  lamp: ReturnType<typeof lampOf>
  px: number
  bloom?: number
}) {
  const p = stopLinePoint(g)
  const housingLen = 22
  const housingW = 8
  const lamps: Array<'red' | 'amber' | 'green'> = ['red', 'amber', 'green']
  // Local frame: origin at the lane centre on the stop line, +x along the
  // direction of travel — so the housing sits 3 px past the line and red,
  // first in the row, is nearest the approaching driver.
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${g.heading}) scale(${px})`}>
      <rect x={2} y={-housingW / 2} width={housingLen} height={housingW} fill="var(--lamp-housing)" />
      {lamps.map((l, i) => {
        const lit = l === lamp
        const cx = 2 + 4 + i * 7
        return (
          <g key={l}>
            {l === 'green' && bloom !== undefined && (
              <motion.circle
                key={bloom}
                cx={cx}
                cy={0}
                fill="none"
                stroke="var(--lamp-green)"
                strokeWidth={1.4}
                initial={{ r: 2.4, opacity: 0.9 }}
                animate={{ r: 9, opacity: 0 }}
                transition={{ duration: DUR.value * 1.6, ease: EASE_OUT }}
              />
            )}
            <circle
              cx={cx}
              cy={0}
              r="2.4"
              fill={lit ? lampLit(l) : 'var(--lamp-unlit)'}
              className={lit && l === 'amber' ? 'amber-breathe' : undefined}
              style={{ transition: 'fill var(--dur-tick) var(--ease-out)' }}
            />
          </g>
        )
      })}
    </g>
  )
}

/** Zebra bars across one crossing band: 0.5 m bars, 0.6 m gaps, 3 m long. */
function zebra(from: number, to: number, at: number, dir: 'h' | 'v') {
  const bars = []
  for (let p = from + 0.4; p + 0.5 <= to - 0.3; p += 1.1) {
    bars.push(
      dir === 'h' ? (
        <rect key={p} x={p} y={at} width={0.5} height={CROSSING_W} />
      ) : (
        <rect key={p} x={at} y={p} width={CROSSING_W} height={0.5} />
      ),
    )
  }
  return bars
}

/**
 * The scenery (overview/cityscape): buildings with their shadows and
 * rooftop units, and trees. It never changes, so it is memoised away from
 * the per-tick re-render.
 */
const CityLayer = memo(function CityLayer() {
  return (
    <g aria-hidden>
      <g fill="rgb(40 52 32 / 0.16)">
        {BUILDINGS.map((bd, i) => {
          const sh = Math.min(bd.height, 14) * 0.09
          return <rect key={i} x={bd.x + sh} y={bd.y + sh * 1.2} width={bd.w} height={bd.h} rx={0.6} />
        })}
        {TREES.map((t, i) => (
          <circle key={i} cx={t.x + t.r * 0.25} cy={t.y + t.r * 0.3} r={t.r} />
        ))}
      </g>
      {BUILDINGS.map((bd, i) => (
        <g key={i}>
          <rect x={bd.x} y={bd.y} width={bd.w} height={bd.h} rx={0.6} fill={roofTone(bd.tone)} stroke="rgb(90 84 70 / 0.35)" strokeWidth={0.25} />
          <rect x={bd.x + 0.8} y={bd.y + 0.8} width={bd.w - 1.6} height={bd.h - 1.6} rx={0.4} fill="none" stroke="rgb(255 255 255 / 0.6)" strokeWidth={0.2} />
          {bd.unit && <circle cx={bd.x + bd.w * bd.unit.u} cy={bd.y + bd.h * bd.unit.v} r={0.9} fill="#2B2F36" />}
        </g>
      ))}
      {TREES.map((t, i) => (
        <g key={i}>
          <circle cx={t.x} cy={t.y} r={t.r} fill={canopyTone(t.tone)} />
          <circle cx={t.x - t.r * 0.28} cy={t.y - t.r * 0.28} r={t.r * 0.5} fill="rgb(255 255 255 / 0.18)" />
        </g>
      ))}
    </g>
  )
})

function plateSummary(lanes: LaneView[], powered: boolean): string {
  if (!powered) return 'Junction plan, simulation not running.'
  const parts = lanes.map((l) => `${laneLabel(l.lane_id)} ${lampOf(l.signal)} ${l.vehicles} vehicles`)
  return `Junction: ${parts.join('; ')}.`
}
