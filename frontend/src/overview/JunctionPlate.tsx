import { useMemo } from 'react'
import type { LaneView, VehicleView } from '@/data/types'
import { useSim } from '@/data/store'
import { lampOf, lampLit, lampColor, isPermissive } from '@/utils/signal'
import {
  ARROWS,
  BOX,
  CROSSING,
  CX,
  CY,
  H,
  KERB_R,
  LANES,
  W,
  labelPos,
  type LaneGeom,
} from './plateGeometry'
import { placeVehicles, type Placed } from './vehiclePlacement'
import { plateSize, shapeOf } from './vehicleTypes'

const MAX_TICKS = 8
const TICK_LEN = 22 // along the lane
const TICK_W = 24 // across the lane
const TICK_GAP = 5

interface Props {
  lanes: LaneView[]
  emergencyLanes: string[]
  /** Real vehicles from the snapshot. When present they replace the
   * synthetic queue ticks entirely — actual traffic beats an inference
   * drawn from a per-lane count. */
  vehicles?: VehicleView[]
  /** Unpowered: heads dark, no traffic — the pre-simulation state. */
  powered: boolean
  /** Pan/zoom window, from TwinViewport. Defaults to the whole plate. */
  viewBox?: string
}

/**
 * The hero. A top-down plan of junction C in signal-plan convention:
 * hairline kerbs, dashed lane dividers, solid stop bars, painted movement
 * arrows, a three-lamp head at every stop bar, and queued vehicles as
 * discrete ticks a viewer can count against the table. Lane fill = that
 * lane's own live SUMO signal; tick count = that lane's vehicle count.
 * One channel per variable.
 */
export function JunctionPlate({ lanes, emergencyLanes, vehicles, powered, viewBox }: Props) {
  const placed: Placed[] = useMemo(
    () => (powered && vehicles ? placeVehicles(vehicles) : []),
    [vehicles, powered],
  )
  const realTraffic = placed.length > 0
  const hoverLane = useSim((s) => s.hoverLane)
  const setHoverLane = useSim((s) => s.setHoverLane)
  // Vehicle positions arrive once per sim tick, so each move is stretched
  // across exactly that interval, linearly. A fixed 300ms transition made
  // cars jump and then freeze for the rest of the tick.
  const tickInterval = useSim((s) => s.tickInterval)
  const byId = useMemo(() => Object.fromEntries(lanes.map((l) => [l.lane_id, l])), [lanes])
  const emergency = useMemo(() => new Set(emergencyLanes), [emergencyLanes])

  return (
    <svg
      viewBox={viewBox ?? `0 0 ${W} ${H}`}
      className="h-full w-full select-none"
      role="img"
      aria-label={plateSummary(lanes, powered)}
    >
      <defs>
        <pattern id="boxHatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="16" stroke="var(--plate-lane)" strokeWidth="1.5" />
        </pattern>
        <pattern id="alertHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--alert)" strokeWidth="2" />
        </pattern>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="var(--plate-marking)" />
        </marker>
      </defs>

      {/* ground + carriageways */}
      <rect width={W} height={H} fill="var(--plate-ground)" />
      <rect x={BOX.x} y={0} width={BOX.w} height={H} fill="var(--plate-road)" />
      <rect x={0} y={BOX.y} width={W} height={BOX.h} fill="var(--plate-road)" />

      {/* kerb fillets (12 m radius in the network) */}
      <path d={`M ${BOX.x} ${BOX.y} A ${KERB_R} ${KERB_R} 0 0 1 ${BOX.x - KERB_R} ${BOX.y} L ${BOX.x} ${BOX.y - KERB_R} Z`} fill="var(--plate-ground)" />
      <path d={`M ${BOX.x + BOX.w} ${BOX.y} A ${KERB_R} ${KERB_R} 0 0 0 ${BOX.x + BOX.w + KERB_R} ${BOX.y} L ${BOX.x + BOX.w} ${BOX.y - KERB_R} Z`} fill="var(--plate-ground)" />
      <path d={`M ${BOX.x} ${BOX.y + BOX.h} A ${KERB_R} ${KERB_R} 0 0 0 ${BOX.x - KERB_R} ${BOX.y + BOX.h} L ${BOX.x} ${BOX.y + BOX.h + KERB_R} Z`} fill="var(--plate-ground)" />
      <path d={`M ${BOX.x + BOX.w} ${BOX.y + BOX.h} A ${KERB_R} ${KERB_R} 0 0 1 ${BOX.x + BOX.w + KERB_R} ${BOX.y + BOX.h} L ${BOX.x + BOX.w} ${BOX.y + BOX.h + KERB_R} Z`} fill="var(--plate-ground)" />

      {/* kerb edge lines */}
      <g fill="none" stroke="var(--plate-kerb)" strokeWidth="1.5">
        <path d={`M 0 ${BOX.y} L ${BOX.x - KERB_R} ${BOX.y} A ${KERB_R} ${KERB_R} 0 0 0 ${BOX.x} ${BOX.y - KERB_R} L ${BOX.x} 0`} />
        <path d={`M ${BOX.x + BOX.w} 0 L ${BOX.x + BOX.w} ${BOX.y - KERB_R} A ${KERB_R} ${KERB_R} 0 0 0 ${BOX.x + BOX.w + KERB_R} ${BOX.y} L ${W} ${BOX.y}`} />
        <path d={`M 0 ${BOX.y + BOX.h} L ${BOX.x - KERB_R} ${BOX.y + BOX.h} A ${KERB_R} ${KERB_R} 0 0 1 ${BOX.x} ${BOX.y + BOX.h + KERB_R} L ${BOX.x} ${H}`} />
        <path d={`M ${BOX.x + BOX.w} ${H} L ${BOX.x + BOX.w} ${BOX.y + BOX.h + KERB_R} A ${KERB_R} ${KERB_R} 0 0 1 ${BOX.x + BOX.w + KERB_R} ${BOX.y + BOX.h} L ${W} ${BOX.y + BOX.h}`} />
      </g>

      {/* junction box — hatched, dashed boundary */}
      <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} fill="url(#boxHatch)" stroke="var(--plate-lane)" strokeDasharray="4 4" strokeWidth="1" />

      {/* medians */}
      <g stroke="var(--plate-marking)" strokeWidth="2.5" opacity="0.9">
        <line x1={CX} y1={0} x2={CX} y2={BOX.y - 10} />
        <line x1={CX} y1={BOX.y + BOX.h + 10} x2={CX} y2={H} />
        <line x1={0} y1={CY} x2={BOX.x - 10} y2={CY} />
        <line x1={BOX.x + BOX.w + 10} y1={CY} x2={W} y2={CY} />
      </g>

      {/* lane dividers — inbound (stronger) and outbound (lighter) */}
      <g strokeWidth="1" fill="none">
        {[36, 72].map((d) => (
          <g key={d}>
            <line x1={CX + d} y1={0} x2={CX + d} y2={BOX.y - 10} stroke="var(--plate-lane)" strokeDasharray="6 4" />
            <line x1={CX - d} y1={BOX.y + BOX.h + 10} x2={CX - d} y2={H} stroke="var(--plate-lane)" strokeDasharray="6 4" />
            <line x1={0} y1={CY - d} x2={BOX.x - 10} y2={CY - d} stroke="var(--plate-lane)" strokeDasharray="6 4" />
            <line x1={BOX.x + BOX.w + 10} y1={CY + d} x2={W} y2={CY + d} stroke="var(--plate-lane)" strokeDasharray="6 4" />
            <line x1={CX - d} y1={0} x2={CX - d} y2={BOX.y - 10} stroke="var(--plate-lane)" strokeDasharray="4 4" opacity="0.5" />
            <line x1={CX + d} y1={BOX.y + BOX.h + 10} x2={CX + d} y2={H} stroke="var(--plate-lane)" strokeDasharray="4 4" opacity="0.5" />
            <line x1={0} y1={CY + d} x2={BOX.x - 10} y2={CY + d} stroke="var(--plate-lane)" strokeDasharray="4 4" opacity="0.5" />
            <line x1={BOX.x + BOX.w + 10} y1={CY - d} x2={W} y2={CY - d} stroke="var(--plate-lane)" strokeDasharray="4 4" opacity="0.5" />
          </g>
        ))}
      </g>

      {/* pedestrian crossings */}
      <g stroke="var(--plate-marking)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7">
        <line x1={BOX.x} y1={BOX.y - 18} x2={BOX.x + BOX.w} y2={BOX.y - 18} />
        <line x1={BOX.x} y1={BOX.y - 18 + CROSSING} x2={BOX.x + BOX.w} y2={BOX.y - 18 + CROSSING} />
        <line x1={BOX.x} y1={BOX.y + BOX.h + 18} x2={BOX.x + BOX.w} y2={BOX.y + BOX.h + 18} />
        <line x1={BOX.x} y1={BOX.y + BOX.h + 18 - CROSSING} x2={BOX.x + BOX.w} y2={BOX.y + BOX.h + 18 - CROSSING} />
        <line x1={BOX.x - 18} y1={BOX.y} x2={BOX.x - 18} y2={BOX.y + BOX.h} />
        <line x1={BOX.x - 18 + CROSSING} y1={BOX.y} x2={BOX.x - 18 + CROSSING} y2={BOX.y + BOX.h} />
        <line x1={BOX.x + BOX.w + 18} y1={BOX.y} x2={BOX.x + BOX.w + 18} y2={BOX.y + BOX.h} />
        <line x1={BOX.x + BOX.w + 18 - CROSSING} y1={BOX.y} x2={BOX.x + BOX.w + 18 - CROSSING} y2={BOX.y + BOX.h} />
      </g>

      {/* per-lane live layer */}
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
          showTicks={!realTraffic}
        />
      ))}

      {/* Real vehicles, from traci.vehicle.getPosition(). Position and
          heading move together in one transform, linearly over exactly
          one tick, so a car turning through the junction sweeps round
          instead of snapping. Size carries the vehicle type; colour is
          left alone because on this plate colour already means signal
          state. */}
      {placed.map((p) => {
        const size = plateSize(shapeOf(p.type))
        return (
          <g
            key={p.id}
            style={{
              transform: `translate(${p.x}px, ${p.y}px) rotate(${p.angle}deg)`,
              transition: `transform ${tickInterval}ms linear`,
            }}
          >
            <rect
              x={-size.length / 2}
              y={-size.width / 2}
              width={size.length}
              height={size.width}
              rx={2}
              fill="var(--plate-vehicle)"
              opacity={p.moving ? 0.95 : 0.7}
            />
          </g>
        )
      })}

      {/* painted arrows + labels, above the fills so they stay legible */}
      <g fill="none" stroke="var(--plate-marking)" strokeWidth="2" opacity="0.9" markerEnd="url(#arrowhead)">
        {LANES.map((g) => (
          <path key={g.id} d={ARROWS[g.id]} />
        ))}
      </g>
      <g fill="var(--plate-marking)" fontFamily="var(--font-num)" fontSize="12" opacity="0.9">
        {LANES.map((g) => {
          const p = labelPos(g)
          const anchor = g.axis === 'v' ? 'middle' : g.approach === 'W' ? 'start' : 'end'
          return (
            <text key={g.id} x={p.x} y={p.y} textAnchor={anchor}>
              {g.id}
            </text>
          )
        })}
      </g>

      {/* north arrow, drafting-style */}
      <g transform={`translate(${W - 34} 34)`}>
        <circle r="14" fill="none" stroke="var(--plate-kerb)" strokeWidth="1" />
        <path d="M 0 -11 L -4 4 L 0 1 L 4 4 Z" fill="var(--ink-strong)" />
        <text y="26" textAnchor="middle" fontSize="11" fontFamily="var(--font-num)" fill="var(--ink-mute)">
          N
        </text>
      </g>
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
  showTicks,
}: {
  g: LaneGeom
  lane: LaneView | undefined
  powered: boolean
  emergency: boolean
  hovered: boolean
  dimmed: boolean
  onHover: (id: string | null) => void
  showTicks: boolean
}) {
  const lamp = powered && lane ? lampOf(lane.signal) : 'off'
  const permissive = !!lane && isPermissive(lane.signal)
  const count = showTicks && powered && lane ? Math.max(0, Math.round(lane.vehicles)) : 0
  const ticks = Math.min(MAX_TICKS, count)
  const overflow = count - ticks

  const v = g.axis === 'v'
  const laneRect = v
    ? { x: g.lo, y: Math.min(g.outer, g.stop), w: g.hi - g.lo, h: Math.abs(g.stop - g.outer) }
    : { x: Math.min(g.outer, g.stop), y: g.lo, w: Math.abs(g.stop - g.outer), h: g.hi - g.lo }
  const mid = (g.lo + g.hi) / 2

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
      {hovered && <rect x={laneRect.x + 0.5} y={laneRect.y + 0.5} width={laneRect.w - 1} height={laneRect.h - 1} fill="none" stroke="var(--accent)" strokeWidth="1" />}

      {/* queue ticks — one per vehicle, stacking back from the stop bar */}
      {Array.from({ length: ticks }, (_, i) => {
        const back = 8 + i * (TICK_LEN + TICK_GAP) // distance from stop bar
        if (v) {
          const y = g.dir === 1 ? g.stop - back - TICK_LEN : g.stop + back
          return <rect key={i} x={mid - TICK_W / 2} y={y} width={TICK_W} height={TICK_LEN} fill="var(--plate-vehicle)" opacity={0.92} />
        }
        const x = g.dir === 1 ? g.stop - back - TICK_LEN : g.stop + back
        return <rect key={i} x={x} y={mid - TICK_W / 2} width={TICK_LEN} height={TICK_W} fill="var(--plate-vehicle)" opacity={0.92} />
      })}
      {overflow > 0 && (
        <text
          x={v ? mid : g.dir === 1 ? g.stop - 8 - MAX_TICKS * (TICK_LEN + TICK_GAP) - 6 : g.stop + 8 + MAX_TICKS * (TICK_LEN + TICK_GAP) + 6}
          y={v ? (g.dir === 1 ? g.stop - 8 - MAX_TICKS * (TICK_LEN + TICK_GAP) - 4 : g.stop + 8 + MAX_TICKS * (TICK_LEN + TICK_GAP) + 10) : mid + 3}
          textAnchor={v ? 'middle' : g.dir === 1 ? 'end' : 'start'}
          fontSize="12"
          fontFamily="var(--font-num)"
          fill="var(--plate-vehicle)"
        >
          +{overflow}
        </text>
      )}

      {/* stop bar — solid, in the lane's signal colour */}
      {v ? (
        <line x1={g.lo} y1={g.stop} x2={g.hi} y2={g.stop} stroke={lamp === 'off' ? 'var(--plate-kerb)' : lampColor(lamp)} strokeWidth="4" strokeDasharray={permissive ? '6 3' : undefined} />
      ) : (
        <line x1={g.stop} y1={g.lo} x2={g.stop} y2={g.hi} stroke={lamp === 'off' ? 'var(--plate-kerb)' : lampColor(lamp)} strokeWidth="4" strokeDasharray={permissive ? '6 3' : undefined} />
      )}

      <SignalHead g={g} lamp={lamp} />
    </g>
  )
}

/** Three lamps in a housing at the stop bar. Unlit lamps stay visible —
 * a real head shows all three lenses — so position, not just hue, says
 * which is lit. */
function SignalHead({ g, lamp }: { g: LaneGeom; lamp: ReturnType<typeof lampOf> }) {
  const v = g.axis === 'v'
  const mid = (g.lo + g.hi) / 2
  const housingLen = 26
  const housingW = 10
  // head sits on the junction side of the stop bar, tucked against the kerb edge of the lane
  const along = g.dir === 1 ? g.stop + 3 : g.stop - 3 - housingLen
  const across = mid + (g.hi - g.lo) / 2 - housingW - 2
  const x = v ? across : along
  const y = v ? along : across
  const w = v ? housingW : housingLen
  const h = v ? housingLen : housingW
  const lamps: Array<'red' | 'amber' | 'green'> = ['red', 'amber', 'green']
  // red is nearest the approaching driver
  const order = g.dir === 1 ? lamps : lamps.toReversed()
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--lamp-housing)" />
      {order.map((l, i) => {
        const cx = v ? x + w / 2 : x + 5 + i * 8
        const cy = v ? y + 5 + i * 8 : y + h / 2
        const lit = l === lamp
        return (
          <circle
            key={l}
            cx={cx}
            cy={cy}
            r="2.8"
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
  if (!powered) return 'Junction C plan, simulation not running.'
  const parts = lanes.map((l) => `${l.lane_id} ${lampOf(l.signal)} ${l.vehicles} vehicles`)
  return `Junction C: ${parts.join('; ')}.`
}
