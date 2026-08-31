import { useMemo } from 'react'
import type { Approach, LaneView } from '@/types/snapshot'
import { signalColor } from '@/utils/theme'
import { fmtLaneMovement } from '@/utils/format'

/**
 * A live top-down schematic of the real, frozen junction (sumo/network/
 * intersection.*.xml, verified in decision_engine.py's own docstring):
 * one traffic light ("C"), 4 approaches, 3 lanes each (left / straight /
 * right). Every lane strip is colored by its OWN live signal character
 * (lanes[].signal) rather than by the aggregate active-phase name, so a
 * viewer can see the ground truth SUMO reports lane by lane, not just
 * the Decision Engine's label for it. Strip opacity/glow scales with
 * that lane's live vehicle count.
 *
 * Layout: a 400x400 viewBox, junction box centered, one road arm per
 * compass direction extending to the edge, each arm split into its 3
 * real lanes.
 */

const SIZE = 400
const CENTER = SIZE / 2
const BOX_HALF = 35 // half-width of the central junction box
const LANE_W = 18
const LANE_GAP = 4

interface Props {
  lanes: LaneView[]
}

function laneMap(lanes: LaneView[]): Record<string, LaneView> {
  const m: Record<string, LaneView> = {}
  for (const l of lanes) m[l.lane_id] = l
  return m
}

function densityOpacity(vehicleCount: number): number {
  // Normalized against decision_engine.py's NORM_VEHICLE_COUNT=20 so the
  // visual scale matches the same "full" point the scoring logic uses.
  return 0.28 + 0.62 * Math.min(1, vehicleCount / 20)
}

/** One 3-lane road arm for a given compass direction. */
function Arm({ approach, lanes }: { approach: Approach; lanes: LaneView[] }) {
  const byId = laneMap(lanes)
  const ids = {
    N: ['N_in_0', 'N_in_1', 'N_in_2'],
    S: ['S_in_0', 'S_in_1', 'S_in_2'],
    E: ['E_in_0', 'E_in_1', 'E_in_2'],
    W: ['W_in_0', 'W_in_1', 'W_in_2'],
  }[approach]

  const vertical = approach === 'N' || approach === 'S'
  const laneSpan = LANE_W * 3 + LANE_GAP * 2

  return (
    <g>
      {ids.map((laneId, i) => {
        const lane = byId[laneId]
        const color = lane ? signalColor(lane.signal) : 'var(--color-text-faint)'
        const opacity = lane ? densityOpacity(lane.vehicles) : 0.15
        const offset = i * (LANE_W + LANE_GAP) - laneSpan / 2 + LANE_W / 2

        if (vertical) {
          const x = CENTER + offset
          const y1 = approach === 'N' ? 0 : CENTER + BOX_HALF
          const y2 = approach === 'N' ? CENTER - BOX_HALF : SIZE
          return (
            <g key={laneId}>
              <rect
                x={x - LANE_W / 2}
                y={Math.min(y1, y2)}
                width={LANE_W}
                height={Math.abs(y2 - y1)}
                rx={3}
                fill={color}
                opacity={opacity}
              />
              <text
                x={x}
                y={approach === 'N' ? 14 : SIZE - 8}
                textAnchor="middle"
                className="fill-[var(--color-text-faint)]"
                fontSize={8}
                fontFamily="var(--font-mono)"
              >
                {fmtLaneMovement(laneId).charAt(0)}
              </text>
            </g>
          )
        }

        const y = CENTER + offset
        const x1 = approach === 'W' ? 0 : CENTER + BOX_HALF
        const x2 = approach === 'W' ? CENTER - BOX_HALF : SIZE
        return (
          <g key={laneId}>
            <rect
              x={Math.min(x1, x2)}
              y={y - LANE_W / 2}
              width={Math.abs(x2 - x1)}
              height={LANE_W}
              rx={3}
              fill={color}
              opacity={opacity}
            />
            <text
              x={approach === 'W' ? 10 : SIZE - 10}
              y={y + 3}
              textAnchor="middle"
              className="fill-[var(--color-text-faint)]"
              fontSize={8}
              fontFamily="var(--font-mono)"
            >
              {fmtLaneMovement(laneId).charAt(0)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function IntersectionDiagram({ lanes }: Props) {
  const compass: Approach[] = useMemo(() => ['N', 'S', 'E', 'W'], [])

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" role="img" aria-label="Live intersection state">
      {/* road surface backdrop */}
      <rect x={0} y={0} width={SIZE} height={SIZE} fill="var(--color-panel-inset)" />

      {compass.map((a) => (
        <Arm key={a} approach={a} lanes={lanes} />
      ))}

      {/* junction box */}
      <rect
        x={CENTER - BOX_HALF}
        y={CENTER - BOX_HALF}
        width={BOX_HALF * 2}
        height={BOX_HALF * 2}
        rx={6}
        fill="var(--color-panel-raised)"
        stroke="var(--color-border)"
        strokeWidth={1}
      />
      <text
        x={CENTER}
        y={CENTER - BOX_HALF - 12}
        textAnchor="middle"
        className="fill-[var(--color-text-faint)]"
        fontSize={10}
        fontWeight={600}
        letterSpacing={1}
      >
        N
      </text>
      <text
        x={CENTER}
        y={SIZE - 6}
        textAnchor="middle"
        className="fill-[var(--color-text-faint)]"
        fontSize={10}
        fontWeight={600}
        letterSpacing={1}
      >
        S
      </text>
    </svg>
  )
}
