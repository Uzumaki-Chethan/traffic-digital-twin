import { useMemo } from 'react'
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
  approachLabelPoint,
  arrowPath,
  junctionOutline,
  laneTransform,
  stopLinePoint,
  type LaneGeom,
} from './plateGeometry'
import { placeVehicles, type Placed } from './vehiclePlacement'
import { shapeOf } from './vehicleTypes'

interface Props {
  lanes: LaneView[]
  emergencyLanes: string[]
  /** Real vehicles from the snapshot, at their SUMO coordinates. */
  vehicles?: VehicleView[]
  /** Unpowered: heads dark, no traffic — the pre-simulation state. */
  powered: boolean
  /** Pan/zoom window in metres, from usePanZoom. */
  viewBox: string
  /** Screen pixels per metre at the current zoom, from usePanZoom.
   * Labels, signal heads and the north arrow are drawn at a constant
   * pixel size. */
  pxPerMetre: number
}

/** The stop line is the junction edge; the crossing band lies just inside it. */
const CROSSING_IN = 0.6
const CROSSING_W = 3

/** Per-lane labels and heads need a lane at least this wide on screen. */
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
export function JunctionPlate({ lanes, emergencyLanes, vehicles, powered, viewBox, pxPerMetre }: Props) {
  const placed: Placed[] = useMemo(
    () => (powered && vehicles ? placeVehicles(vehicles) : []),
    [vehicles, powered],
  )
  const hoverLane = useSim((s) => s.hoverLane)
  const setHoverLane = useSim((s) => s.setHoverLane)
  // Vehicle positions arrive once per sim tick, so each move is stretched
  // across exactly that interval, linearly. A fixed 300ms transition made
  // cars jump and then freeze for the rest of the tick.
  const tickInterval = useSim((s) => s.tickInterval)
  const byId = useMemo(() => Object.fromEntries(lanes.map((l) => [l.lane_id, l])), [lanes])
  const emergency = useMemo(() => new Set(emergencyLanes), [emergencyLanes])
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
        <pattern id="boxHatch" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3.2" stroke="var(--plate-lane)" strokeWidth="0.3" />
        </pattern>
        <pattern id="alertHatch" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.6" stroke="var(--alert)" strokeWidth="0.4" />
        </pattern>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="1.6" markerHeight="1.6" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="var(--plate-marking)" />
        </marker>
      </defs>

      {/* ground, well past the network so a wide window shows land, not card */}
      <rect x={-NET * 4} y={-NET * 4} width={NET * 9} height={NET * 9} fill="var(--plate-ground)" />

      {/* carriageways and the junction, exactly the network's shapes */}
      {ARM_RECTS.map(([x, y, w, h]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} fill="var(--plate-road)" />
      ))}
      <path d={junctionOutline()} fill="var(--plate-road)" />

      {/* kerb edge lines: each corner is arm edge -> 12 m fillet -> arm edge */}
      <g fill="none" stroke="var(--plate-kerb)" strokeWidth="1" vectorEffect="non-scaling-stroke">
        <path d={`M ${hi} 0 L ${hi} ${a} A ${KERB_R} ${KERB_R} 0 0 0 ${b} ${lo} L ${NET} ${lo}`} vectorEffect="non-scaling-stroke" />
        <path d={`M ${NET} ${hi} L ${b} ${hi} A ${KERB_R} ${KERB_R} 0 0 0 ${hi} ${b} L ${hi} ${NET}`} vectorEffect="non-scaling-stroke" />
        <path d={`M ${lo} ${NET} L ${lo} ${b} A ${KERB_R} ${KERB_R} 0 0 0 ${a} ${hi} L 0 ${hi}`} vectorEffect="non-scaling-stroke" />
        <path d={`M 0 ${lo} L ${a} ${lo} A ${KERB_R} ${KERB_R} 0 0 0 ${lo} ${a} L ${lo} 0`} vectorEffect="non-scaling-stroke" />
      </g>

      {/* junction box — hatched, dashed boundary, as on a signal plan */}
      <path d={junctionOutline()} fill="url(#boxHatch)" stroke="var(--plate-lane)" strokeDasharray="0.8 0.8" strokeWidth="0.2" />

      {/* pedestrian crossings, a 3 m band just inside each stop line */}
      <g stroke="var(--plate-marking)" strokeWidth="0.2" strokeDasharray="0.6 0.6" opacity="0.7">
        <line x1={lo} y1={a + CROSSING_IN} x2={hi} y2={a + CROSSING_IN} />
        <line x1={lo} y1={a + CROSSING_IN + CROSSING_W} x2={hi} y2={a + CROSSING_IN + CROSSING_W} />
        <line x1={lo} y1={b - CROSSING_IN} x2={hi} y2={b - CROSSING_IN} />
        <line x1={lo} y1={b - CROSSING_IN - CROSSING_W} x2={hi} y2={b - CROSSING_IN - CROSSING_W} />
        <line x1={a + CROSSING_IN} y1={lo} x2={a + CROSSING_IN} y2={hi} />
        <line x1={a + CROSSING_IN + CROSSING_W} y1={lo} x2={a + CROSSING_IN + CROSSING_W} y2={hi} />
        <line x1={b - CROSSING_IN} y1={lo} x2={b - CROSSING_IN} y2={hi} />
        <line x1={b - CROSSING_IN - CROSSING_W} y1={lo} x2={b - CROSSING_IN - CROSSING_W} y2={hi} />
      </g>

      {/* medians — solid, 0.5 m paint */}
      <g stroke="var(--plate-marking)" strokeWidth="0.5" opacity="0.9">
        <line x1={CENTRE} y1={0} x2={CENTRE} y2={a} />
        <line x1={CENTRE} y1={b} x2={CENTRE} y2={NET} />
        <line x1={0} y1={CENTRE} x2={a} y2={CENTRE} />
        <line x1={b} y1={CENTRE} x2={NET} y2={CENTRE} />
      </g>

      {/* lane dividers — 3 m dash, 3 m gap; inbound stronger than outbound */}
      <g stroke="var(--plate-lane)" strokeWidth="0.25" fill="none" strokeDasharray="3 3">
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

      {/* lane names, painted on the road under the traffic like sumo-gui's
          lane ids, only once a lane is wide enough on screen to carry one.
          Barlow, not the mono face: the vendored JetBrains Mono subset has
          no middle dot, and "North · Left" is words now, not a code. */}
      {laneDetail && (
        <g
          fill="var(--plate-marking)"
          fontFamily="var(--font-ui)"
          fontSize="11"
          fontWeight="500"
          opacity="0.9"
          stroke="var(--plate-road)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {LANES.map((g) => {
            const p = stopLinePoint(g)
            // Staggered along the lane - 20, 52 and 84 m back from the line
            // for lanes 0, 1, 2 - because three 11 px labels on lanes 9 px
            // apart would sit on top of each other. Reads left-to-right or
            // top-to-bottom whichever way the traffic runs.
            const back = 20 + g.index * 32
            const x = g.axis === 'v' ? p.x : p.x - g.dir * back
            const y = g.axis === 'v' ? p.y - g.dir * back : p.y
            const rotate = g.axis === 'v' ? 90 : 0
            return (
              <g key={g.id} transform={`translate(${x} ${y}) rotate(${rotate}) scale(${px})`}>
                <text textAnchor="middle" dominantBaseline="middle">
                  {laneLabel(g.id)}
                </text>
              </g>
            )
          })}
        </g>
      )}

      {/* approach names at the ends of the arms */}
      <g fill="var(--ink-strong)" fontFamily="var(--font-ui)" fontSize="12" fontWeight="600" opacity="0.85">
        {(Object.keys(APPROACH_NAMES) as Arm[]).map((arm) => {
          const p = approachLabelPoint(arm)
          const anchor = arm === 'S' || arm === 'E' ? 'end' : 'start'
          const baseline = arm === 'N' || arm === 'W' ? 'hanging' : 'auto'
          return (
            <g key={arm} transform={`translate(${p.x} ${p.y}) scale(${px})`}>
              <text textAnchor={anchor} dominantBaseline={baseline}>
                {APPROACH_NAMES[arm]}
              </text>
            </g>
          )
        })}
      </g>

      {/* Real vehicles at their real size and position. Position and
          heading move together in one transform, linearly over exactly
          one tick, so a car turning through the junction sweeps round
          instead of snapping. Size carries the vehicle type; colour is
          left alone because on this plate colour already means signal
          state. */}
      {placed.map((p) => {
        const shape = shapeOf(p.type)
        return (
          <g
            key={p.id}
            style={{
              transform: `translate(${p.x}px, ${p.y}px) rotate(${p.angle}deg)`,
              transition: `transform ${tickInterval}ms linear`,
            }}
          >
            <rect
              x={-shape.length / 2}
              y={-shape.width / 2}
              width={shape.length}
              height={shape.width}
              rx={0.3}
              fill="var(--plate-vehicle)"
              opacity={p.moving ? 0.95 : 0.75}
            />
          </g>
        )
      })}

      {/* north arrow, drafting-style, pinned to the window's top-right */}
      <g transform={`translate(${vb.x + vb.w} ${vb.y}) scale(${px}) translate(-34 34)`}>
        <circle r="14" fill="none" stroke="var(--plate-kerb)" strokeWidth="1" />
        <path d="M 0 -11 L -4 4 L 0 1 L 4 4 Z" fill="var(--ink-strong)" />
        <text y="26" textAnchor="middle" fontSize="11" fontFamily="var(--font-num)" fill="var(--ink-mute)">
          N
        </text>
      </g>

      {/* signal heads, above the traffic, at a constant pixel size */}
      {laneDetail &&
        LANES.map((g) => {
          const lane = byId[g.id]
          const lamp = powered && lane ? lampOf(lane.signal) : 'off'
          return <SignalHead key={g.id} g={g} lamp={lamp} px={px} />
        })}
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
 */
function SignalHead({ g, lamp, px }: { g: LaneGeom; lamp: ReturnType<typeof lampOf>; px: number }) {
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
        return (
          <circle
            key={l}
            cx={2 + 4 + i * 7}
            cy={0}
            r="2.4"
            fill={lit ? lampLit(l) : 'var(--lamp-unlit)'}
            className={lit && l === 'amber' ? 'amber-breathe' : undefined}
            style={{ transition: 'fill var(--dur-tick) var(--ease-out)' }}
          />
        )
      })}
    </g>
  )
}

function plateSummary(lanes: LaneView[], powered: boolean): string {
  if (!powered) return 'Junction plan, simulation not running.'
  const parts = lanes.map((l) => `${laneLabel(l.lane_id)} ${lampOf(l.signal)} ${l.vehicles} vehicles`)
  return `Junction: ${parts.join('; ')}.`
}
