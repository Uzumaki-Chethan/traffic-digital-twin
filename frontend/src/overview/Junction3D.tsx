import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { BUILDINGS, CITY_EXTENT, GROUND_DAY, SIDEWALK_DAY, SIDEWALK_OUT, TREES, canopyTone, roofTone } from './cityscape'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { LaneView, VehicleView } from '@/data/types'
import { useSim } from '@/data/store'
import { useClockRate } from '@/data/useClockRate'
import { DisplayClock, motionBuffer, type MotionSide, type Pose } from '@/data/motion'
import { lampOf } from '@/utils/signal'
import { BEACONS, isStalledVehicleId, shapeOf, type VehicleShape } from './vehicleTypes'

/**
 * A miniature 3D model of the junction, to the REAL network scale
 * (unlike the plan view, which exaggerates lane width ~14x so lanes stay
 * readable across a room). Drag to orbit, scroll to zoom, right-drag to
 * pan; it auto-rotates gently until you touch it, then leaves you alone.
 *
 * GEOMETRY, and why every number below is a measurement rather than a
 * guess — all read out of sumo/network/intersection.net.xml:
 *
 *   3 lanes per direction, 3.2 m each        -> carriageway 9.6 m, road 19.2 m
 *   inbound lanes end 21.6 m from centre     -> the junction is 43.2 m square
 *   inbound lane length 178.4 m              -> 21.6 + 178.4 = 200, the arm
 *   N_in x = 201.6/204.8/208.0 (east side)   -> keep-left, lane 0 at the kerb
 *   S_in x = 192.0/195.2/198.4 (west side)
 *   W_in y = 201.6/204.8/208.0 (north side)
 *   E_in y = 192.0/195.2/198.4 (south side)
 *
 * SIGNALS are one mast-arm head per approach, mounted horizontally over
 * the carriageway and facing back down its own approach, with four
 * aspects in a row:
 *
 *     ( red ) ( amber ) ( left + ahead ) ( right )
 *
 * which is the shape of this junction's phase structure: the program
 * runs straight-and-left together and the right turns in their own
 * protected phase, so two green aspects say everything a driver needs.
 * The coloured bars at the stop lines carry the full twelve-lane detail
 * underneath, mirroring sumo-gui's own per-lane indication.
 *
 * VEHICLE POSITION. TraCI reports a vehicle's FRONT BUMPER — measured on
 * a live run, every stopped vehicle sits exactly 1.00 m before its stop
 * line, which is SUMO's own gap. A body centred on that coordinate
 * therefore pushes half its length across the stop bar and into the
 * junction, so every body is drawn half a length back along its heading.
 *
 * MOTION. Positions arrive once per simulation tick (~1 s), so the model
 * has to fill in the second in between. It does that by moving each
 * vehicle at CONSTANT velocity from where it was to where the snapshot
 * says it is, across exactly the measured tick interval. An earlier
 * version eased exponentially toward the target, which decelerates as it
 * arrives and then jerks off again when the next tick lands — that is
 * what made the flow look frame-by-frame. Interpolation is allowed to
 * run slightly past the end of a tick so a late frame does not stall the
 * traffic, and heading is taken once per tick from the whole segment
 * rather than per frame from a shrinking remainder.
 *
 * A vehicle's FIRST heading comes from its lane, not from a movement
 * delta: a car that enters the network already stopped in a queue never
 * produces one, and without this it sat at the stop line facing whatever
 * the default was — which is why cars were parked sideways at the signal.
 *
 * SUMO coordinates map straight in: the network is 400 m square with the
 * junction at (200, 200), so world x = sumo_x - 200 and world z =
 * 200 - sumo_y (three's +z runs south where SUMO's +y runs north).
 */

const NET = 400
const HALF_NET = 200
const CENTRE = 200
const LANE_W = 3.2
const ROAD_HALF = 9.6 // three 3.2 m lanes per direction
const JUNCTION_HALF = 21.6 // where the inbound lanes stop
const KERB_R = 11 // the junction's corner fillets (plateGeometry.KERB_R, and why it is not the net's 12)
const ARM = HALF_NET - JUNCTION_HALF // 178.4, the drawn length of one arm
const ARM_MID = JUNCTION_HALF + ARM / 2

// sumo-gui's own palette, near enough: near-black asphalt, saturated
// green surroundings, off-white paint.
const ASPHALT = '#5c6168'
const GROUND = GROUND_DAY
const HORIZON = '#cfe2f1' // daytime sky, and the fog the city fades into
const PAINT = '#f2f2ee'
const CENTRE_PAINT = '#e8b923'
const HOUSING = '#15110d'
const LENS_OFF = '#3d352b'
const RED = '#ff0505'
const AMBER = '#efb700'
const GREEN = '#4cbb17'

const PAINT_Y = 0.22 // road surface is at 0.20
const DASH_LEN = 3
const DASH_GAP = 6

interface Props {
  lanes: LaneView[]
  vehicles?: VehicleView[]
  powered: boolean
  /** Which motion buffer to draw (the demo by default). */
  motionSide?: MotionSide
  /** True only while the running scenario is Rain (data/pageContext.ts).
   * Falling streaks, reporting the sim's own weather — see the matching
   * note on JunctionPlate's own `raining` prop. */
  raining?: boolean
}

interface Car {
  group: THREE.Group
  type: string
  /** Half the body length, in metres — the bumper-to-centre offset. */
  halfLength: number
  /** An emergency vehicle's two roof lamps, blinked in the render loop. */
  beacons?: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]
  /** A stalled vehicle's smoke puffs, shown only while it is actually
   * stopped (the render loop checks its current speed). */
  smoke?: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; phase: number; riseFrom: number }[]
}

/** How an emergency vehicle is painted, over the vType's colour: an
 * ambulance is a white van with a red band, a fire engine is red, a
 * police car is dark blue with white doors. */
const EMERGENCY_PAINT: Record<string, { body: string; band?: string; kind: 'van' | 'truck' | 'car' }> = {
  ambulance: { body: '#f4f4f4', band: '#d1202a', kind: 'van' },
  fire_engine: { body: '#c8102e', band: '#f0f0f0', kind: 'truck' },
  police_vehicle: { body: '#12245c', band: '#f0f0f0', kind: 'car' },
}

/**
 * Per-approach facts, all derived from the lane shapes above.
 *   bearing  rotation.y that makes the mast face oncoming traffic
 *   kerb     the mast base, on the driver's left at the stop line
 *   lanePos  where each of the three inbound lanes centres, in order 0,1,2
 *   vertical true when the approach runs north-south
 */
const APPROACHES = [
  {
    arm: 'N',
    bearing: Math.PI, // traffic comes from the north, so the head looks north
    kerb: [ROAD_HALF + 2.2, -(JUNCTION_HALF + 1.4)] as const,
    lanePos: [8.0, 4.8, 1.6],
    vertical: true,
  },
  {
    arm: 'S',
    bearing: 0,
    kerb: [-(ROAD_HALF + 2.2), JUNCTION_HALF + 1.4] as const,
    lanePos: [-8.0, -4.8, -1.6],
    vertical: true,
  },
  {
    arm: 'E',
    bearing: Math.PI / 2,
    kerb: [JUNCTION_HALF + 1.4, ROAD_HALF + 2.2] as const,
    lanePos: [8.0, 4.8, 1.6],
    vertical: false,
  },
  {
    arm: 'W',
    bearing: -Math.PI / 2,
    kerb: [-(JUNCTION_HALF + 1.4), -(ROAD_HALF + 2.2)] as const,
    lanePos: [-8.0, -4.8, -1.6],
    vertical: false,
  },
] as const

/**
 * Where each lane sits along the mast arm, measured from the mast base.
 * The kerb is 2.2 m outside the 9.6 m carriageway edge and the lane
 * centres are 8.0 / 4.8 / 1.6 m from the road centreline, so the arm
 * reaches 3.8 / 7.0 / 10.2 m across. Identical on all four approaches
 * once each mast is rotated onto its own bearing.
 */
const HEAD_ALONG_ARM = [3.8, 7.0, 10.2]
/** The head hangs over the middle lane, i.e. the centre of the carriageway. */
const HEAD_ALONG = HEAD_ALONG_ARM[1]
const MAST_HEIGHT = 10.6
const HEAD_CENTRE_Y = 8.7
/**
 * Four aspects in a row (Section 34.1): a shared red circle, a shared
 * amber circle, one combined left+ahead arrow, and a right arrow - real
 * signal hardware for a "turn together" movement uses a single physical
 * lens carrying one glyph with both an upward and a leftward arrowhead,
 * not two separate pictograms lit together. The two shared circles take
 * over - arrows dark - only once nothing on this approach is being served
 * at all (see the tick loop's own comment).
 */
const LENS_X = [-2.25, -0.75, 0.75, 2.25]

/**
 * An arrow lens in the xy plane facing +z. The head faces the driver
 * along its local +z, so the driver's LEFT is local -x — a left arrow is
 * 180 degrees, not 0.
 */
function arrowShape(turn: number): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(-0.4, -0.15)
  s.lineTo(0.06, -0.15)
  s.lineTo(0.06, -0.35)
  s.lineTo(0.5, 0)
  s.lineTo(0.06, 0.35)
  s.lineTo(0.06, 0.15)
  s.lineTo(-0.4, 0.15)
  s.closePath()
  const pts = s.getPoints()
  const turned = new THREE.Shape()
  pts.forEach((pt, i) => {
    const x = pt.x * Math.cos(turn) - pt.y * Math.sin(turn)
    const y = pt.x * Math.sin(turn) + pt.y * Math.cos(turn)
    if (i === 0) turned.moveTo(x, y)
    else turned.lineTo(x, y)
  })
  turned.closePath()
  return turned
}

const TURN_RIGHT = 0

/**
 * A single combined "left + ahead" arrow glyph (Section 34.1): one shared
 * stem forking into an upward arrowhead and a left arrowhead - the shape
 * a real combined-movement signal lens actually uses, not two of
 * arrowShape()'s own arrows (each of which carries a tail pointing away
 * from its own head) overlaid on each other, which reads as a confusing
 * cross rather than a single legible glyph.
 */
function combinedLeftAheadShape(): THREE.Shape {
  const s = new THREE.Shape()
  const pts: [number, number][] = [
    [-0.08, -0.45], // stem, bottom-left
    [0.08, -0.45], // stem, bottom-right
    [0.08, 0.16], // stem's right edge, straight up (untouched by the left fork)
    [0.22, 0.16], // out to the ahead-arrowhead's base
    [0, 0.5], // ahead tip
    [-0.22, 0.16], // ahead-arrowhead's other base corner
    [-0.08, 0.16], // back in to stem width
    [-0.08, 0.03], // down to where the left branch forks off
    [-0.34, 0.03], // out along the left branch's top edge
    [-0.34, 0.15], // flare up for the left-arrowhead's base
    [-0.55, -0.05], // left tip
    [-0.34, -0.25], // left-arrowhead's other base corner
    [-0.34, -0.13], // back in to the left branch's width
    [-0.08, -0.13], // back to the stem
  ]
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)))
  s.closePath()
  return s
}

export function Junction3D({ lanes, powered, motionSide = 'demo', raining = false }: Props) {
  const mount = useRef<HTMLDivElement>(null)
  // The compass overlay; turned every frame to keep its arrow on world
  // north however the camera has been orbited.
  const compass = useRef<SVGSVGElement>(null)
  // The steady clock rate (set speed, not the wobbling measurement).
  const rate = useClockRate()
  const smooth = useSim((s) => s.smooth)
  const data = useRef({ lanes, powered, motionSide, rate, smooth, raining })
  useEffect(() => {
    data.current = { lanes, powered, motionSide, rate, smooth, raining }
  }, [lanes, powered, motionSide, rate, smooth, raining])

  useEffect(() => {
    const el = mount.current
    if (!el) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(HORIZON)
    scene.fog = new THREE.Fog(HORIZON, 240, 620)

    const camera = new THREE.PerspectiveCamera(40, 1, 1, 3000)
    camera.position.set(70, 62, 96)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      el.textContent = '3D view unavailable — this display has no WebGL.'
      return
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    // A soft studio environment for reflections — applied to the vehicles'
    // paint, glass and chrome only (envMap per material), so they read as
    // paint and glass while the road, buildings and ground keep their
    // lighting exactly. Built once per mount.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    el.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.style.cursor = 'grab'

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 28
    controls.maxDistance = 700
    // Stay above the ground plane; looking up from underneath is never useful.
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35
    controls.target.set(0, 0, 0)
    // Once someone takes hold of it, stop moving on its own, and show the
    // hand closing while they hold it.
    const stopAuto = () => {
      controls.autoRotate = false
      renderer.domElement.style.cursor = 'grabbing'
    }
    const release = () => {
      renderer.domElement.style.cursor = 'grab'
    }
    controls.addEventListener('start', stopAuto)
    controls.addEventListener('end', release)
    renderer.domElement.addEventListener('wheel', stopAuto, { passive: true })

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6f8a5a, 1.1))
    const sun = new THREE.DirectionalLight(0xfff6e0, 1.35)
    sun.position.set(120, 220, 90)
    scene.add(sun)

    // Everything built once at mount is tracked here so unmount can free
    // it — geometries and materials are shared between meshes, so walking
    // the scene graph alone would miss the pooled ones.
    const owned: { dispose: () => void }[] = []
    const own = <T extends { dispose: () => void }>(x: T): T => {
      owned.push(x)
      return x
    }

    // ---- ground and carriageways ---------------------------------------
    const ground = new THREE.Mesh(
      own(new THREE.PlaneGeometry(NET * 3, NET * 3)),
      own(new THREE.MeshStandardMaterial({ color: GROUND })),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.02
    scene.add(ground)

    // Four arms plus the junction square, cut so nothing overlaps — two
    // crossing full-length slabs would z-fight across the whole junction.
    const asphalt = own(new THREE.MeshStandardMaterial({ color: ASPHALT, roughness: 0.95 }))
    const armNS = own(new THREE.BoxGeometry(ROAD_HALF * 2, 0.4, ARM))
    const armEW = own(new THREE.BoxGeometry(ARM, 0.4, ROAD_HALF * 2))
    for (const sign of [-1, 1]) {
      const ns = new THREE.Mesh(armNS, asphalt)
      ns.position.set(0, 0, sign * ARM_MID)
      const ew = new THREE.Mesh(armEW, asphalt)
      ew.position.set(sign * ARM_MID, 0, 0)
      scene.add(ns, ew)
    }
    // The junction slab is the network's own `<junction id="C">` shape,
    // as the plan view draws it: a 19.2 m opening on each side joined by
    // 12 m quarter-circle kerbs that curve INTO the corners (centred on
    // the outer corner), not a square. Built in the plan's frame (x east,
    // y south) and laid flat, which maps y onto -z as the vehicles are.
    const junction = new THREE.Shape()
    {
      const a = -JUNCTION_HALF
      const b = JUNCTION_HALF
      const lo = -ROAD_HALF
      const hi = ROAD_HALF
      const r = KERB_R
      junction.moveTo(lo, a)
      junction.lineTo(hi, a)
      junction.absarc(b, a, r, Math.PI, Math.PI / 2, true)
      junction.lineTo(b, hi)
      junction.absarc(b, b, r, -Math.PI / 2, -Math.PI, true)
      junction.lineTo(lo, b)
      junction.absarc(a, b, r, 0, -Math.PI / 2, true)
      junction.lineTo(a, lo)
      junction.absarc(a, a, r, Math.PI / 2, 0, true)
      junction.closePath()
    }
    const junctionSlab = new THREE.Mesh(
      own(new THREE.ExtrudeGeometry(junction, { depth: 0.4, bevelEnabled: false, curveSegments: 24 })),
      asphalt,
    )
    junctionSlab.rotation.x = -Math.PI / 2
    junctionSlab.position.y = -0.2
    scene.add(junctionSlab)

    // ---- lane markings --------------------------------------------------
    const paint = own(new THREE.MeshStandardMaterial({ color: PAINT, roughness: 0.7 }))

    // Solid: both outer edges and the centre line dividing opposing traffic.
    const centrePaint = own(new THREE.MeshStandardMaterial({ color: CENTRE_PAINT, roughness: 0.7 }))
    const solidNS = own(new THREE.BoxGeometry(0.22, 0.08, ARM))
    const solidEW = own(new THREE.BoxGeometry(ARM, 0.08, 0.22))
    const centreNS = own(new THREE.BoxGeometry(0.15, 0.08, ARM))
    const centreEW = own(new THREE.BoxGeometry(ARM, 0.08, 0.15))
    for (const sign of [-1, 1]) {
      for (const off of [-ROAD_HALF, ROAD_HALF]) {
        const ns = new THREE.Mesh(solidNS, paint)
        ns.position.set(off, PAINT_Y, sign * ARM_MID)
        const ew = new THREE.Mesh(solidEW, paint)
        ew.position.set(sign * ARM_MID, PAINT_Y, off)
        scene.add(ns, ew)
      }
      // double yellow centre line, as on the plan
      for (const off of [-0.22, 0.22]) {
        const ns = new THREE.Mesh(centreNS, centrePaint)
        ns.position.set(off, PAINT_Y, sign * ARM_MID)
        const ew = new THREE.Mesh(centreEW, centrePaint)
        ew.position.set(sign * ARM_MID, PAINT_Y, off)
        scene.add(ns, ew)
      }
    }

    // ---- the city: sidewalks, buildings, trees (overview/cityscape) ----
    // One layout shared with the plan view: plan (x, y) -> (x - 200, y - 200).
    {
      const walk = own(new THREE.MeshStandardMaterial({ color: SIDEWALK_DAY, roughness: 0.9 }))
      const stripLen = HALF_NET + CITY_EXTENT - JUNCTION_HALF
      const stripW = SIDEWALK_OUT - ROAD_HALF
      const stripNS = own(new THREE.BoxGeometry(stripW, 0.5, stripLen))
      const stripEW = own(new THREE.BoxGeometry(stripLen, 0.5, stripW))
      for (const sign of [-1, 1]) {
        for (const side of [-1, 1]) {
          const across = side * (ROAD_HALF + stripW / 2)
          const along = sign * (JUNCTION_HALF + stripLen / 2)
          const ns = new THREE.Mesh(stripNS, walk)
          ns.position.set(across, 0.05, along)
          const ew = new THREE.Mesh(stripEW, walk)
          ew.position.set(along, 0.05, across)
          scene.add(ns, ew)
        }
      }
      // paved corners round the box, just under the road surface
      const pad = new THREE.Mesh(own(new THREE.BoxGeometry(JUNCTION_HALF * 2 + 8, 0.36, JUNCTION_HALF * 2 + 8)), walk)
      pad.position.y = 0
      scene.add(pad)

      const box = own(new THREE.BoxGeometry(1, 1, 1))
      const wallMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }))
      const blocks = new THREE.InstancedMesh(box, wallMat, BUILDINGS.length)
      const unitMat = own(new THREE.MeshStandardMaterial({ color: '#2B2F36', roughness: 0.6 }))
      const withUnit = BUILDINGS.filter((b) => b.unit)
      const units = new THREE.InstancedMesh(box, unitMat, withUnit.length)
      const mm = new THREE.Matrix4()
      const q0 = new THREE.Quaternion()
      const col = new THREE.Color()
      let ui = 0
      BUILDINGS.forEach((b, i) => {
        mm.compose(new THREE.Vector3(b.x + b.w / 2 - CENTRE, b.height / 2, b.y + b.h / 2 - CENTRE), q0, new THREE.Vector3(b.w, b.height, b.h))
        blocks.setMatrixAt(i, mm)
        blocks.setColorAt(i, col.set(roofTone(b.tone)))
        if (b.unit) {
          mm.compose(
            new THREE.Vector3(b.x + b.w * b.unit.u - CENTRE, b.height + 0.6, b.y + b.h * b.unit.v - CENTRE),
            q0,
            new THREE.Vector3(1.8, 1.2, 1.8),
          )
          units.setMatrixAt(ui++, mm)
        }
      })
      blocks.instanceMatrix.needsUpdate = true
      if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true
      units.instanceMatrix.needsUpdate = true
      scene.add(blocks, units)

      const trunkMat = own(new THREE.MeshStandardMaterial({ color: '#6B4F36', roughness: 0.9 }))
      const leafMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }))
      const trunks = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.22, 0.3, 1, 6)), trunkMat, TREES.length)
      const crowns = new THREE.InstancedMesh(own(new THREE.IcosahedronGeometry(1, 1)), leafMat, TREES.length)
      TREES.forEach((t, i) => {
        const trunkH = 2.2 + t.r * 0.5
        mm.compose(new THREE.Vector3(t.x - CENTRE, trunkH / 2, t.y - CENTRE), q0, new THREE.Vector3(1, trunkH, 1))
        trunks.setMatrixAt(i, mm)
        mm.compose(new THREE.Vector3(t.x - CENTRE, trunkH + t.r * 0.75, t.y - CENTRE), q0, new THREE.Vector3(t.r, t.r * 0.95, t.r))
        crowns.setMatrixAt(i, mm)
        crowns.setColorAt(i, col.set(canopyTone(t.tone)))
      })
      trunks.instanceMatrix.needsUpdate = true
      crowns.instanceMatrix.needsUpdate = true
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true
      scene.add(trunks, crowns)
    }

    // Dashed: the four lane dividers, as one instanced mesh. About 320
    // short boxes, which is one draw call this way and 320 the naive way.
    const dashes: { x: number; z: number; turn: boolean }[] = []
    for (const off of [-LANE_W * 2, -LANE_W, LANE_W, LANE_W * 2]) {
      for (const sign of [-1, 1]) {
        for (let d = JUNCTION_HALF + DASH_GAP / 2; d + DASH_LEN < HALF_NET; d += DASH_LEN + DASH_GAP) {
          const along = sign * (d + DASH_LEN / 2)
          dashes.push({ x: off, z: along, turn: false })
          dashes.push({ x: along, z: off, turn: true })
        }
      }
    }
    const dashMesh = new THREE.InstancedMesh(
      own(new THREE.BoxGeometry(0.18, 0.08, DASH_LEN)),
      paint,
      dashes.length,
    )
    const m4 = new THREE.Matrix4()
    const noTurn = new THREE.Quaternion()
    const unit = new THREE.Vector3(1, 1, 1)
    const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    dashes.forEach((d, i) => {
      m4.compose(new THREE.Vector3(d.x, PAINT_Y, d.z), d.turn ? quarter : noTurn, unit)
      dashMesh.setMatrixAt(i, m4)
    })
    dashMesh.instanceMatrix.needsUpdate = true
    scene.add(dashMesh)

    // Stop bars, across the three inbound lanes of each approach only.
    const stopNS = own(new THREE.BoxGeometry(ROAD_HALF, 0.09, 0.55))
    const stopEW = own(new THREE.BoxGeometry(0.55, 0.09, ROAD_HALF))
    for (const a of APPROACHES) {
      const mid = (a.lanePos[0] + a.lanePos[2]) / 2
      const at = Math.sign(a.kerb[a.vertical ? 1 : 0]) * (JUNCTION_HALF + 0.5)
      const bar = new THREE.Mesh(a.vertical ? stopNS : stopEW, paint)
      bar.position.set(a.vertical ? mid : at, PAINT_Y, a.vertical ? at : mid)
      scene.add(bar)
    }

    // ---- mast-arm signals ------------------------------------------------
    const housingMat = own(new THREE.MeshStandardMaterial({ color: HOUSING, roughness: 0.6 }))
    const poleGeom = own(new THREE.CylinderGeometry(0.3, 0.34, MAST_HEIGHT, 10))
    const mastGeom = own(new THREE.BoxGeometry(HEAD_ALONG + 0.8, 0.26, 0.26))
    const headGeom = own(new THREE.BoxGeometry(7.2, 2.0, 0.85))
    const discGeom = own(new THREE.CircleGeometry(0.58, 20))
    const rightGeom = own(new THREE.ShapeGeometry(arrowShape(TURN_RIGHT)))
    const combinedGeom = own(new THREE.ShapeGeometry(combinedLeftAheadShape()))
    const barNS = own(new THREE.BoxGeometry(LANE_W - 0.5, 0.12, 0.75))
    const barEW = own(new THREE.BoxGeometry(0.75, 0.12, LANE_W - 0.5))

    interface Head {
      /** The three inbound lanes this head speaks for, in order 0 (left),
       * 1 (straight), 2 (right). */
      lanes: string[]
      /** The two shared circles - lit only once nothing on this approach
       * is being served at all (see the tick loop). */
      redCircle: THREE.MeshStandardMaterial
      amberCircle: THREE.MeshStandardMaterial
      /** One material per ARROW LENS, not per movement: [combined, right].
       * Left and straight always run in the same phase together on this
       * junction (Section 34.1), so they share one physical lens: a single
       * merged glyph (combinedGeom) with both an upward and a leftward
       * arrowhead, exactly like a real "left+ahead" signal aspect. */
      arrows: THREE.MeshStandardMaterial[]
      bars: { lane: string; mat: THREE.MeshStandardMaterial }[]
    }
    const heads: Head[] = []

    for (const a of APPROACHES) {
      const mast = new THREE.Group()
      mast.position.set(a.kerb[0], 0, a.kerb[1])
      // Built facing local +z and then turned to look back down its own
      // approach. Local +x runs from the kerb out across the lanes.
      mast.rotation.y = a.bearing

      const pole = new THREE.Mesh(poleGeom, housingMat)
      pole.position.set(0, MAST_HEIGHT / 2, 0)
      const arm = new THREE.Mesh(mastGeom, housingMat)
      arm.position.set((HEAD_ALONG + 0.8) / 2 - 0.4, MAST_HEIGHT - 0.2, 0)
      const head = new THREE.Mesh(headGeom, housingMat)
      head.position.set(HEAD_ALONG, HEAD_CENTRE_Y, 0)
      mast.add(pole, arm, head)

      // Four aspects in a row (Section 34.1): a shared red circle, a
      // shared amber circle, one combined left+ahead arrow lens (single
      // glyph, single material - see combinedGeom above), and a right
      // arrow. Left and straight always run in the same phase together on
      // this junction, so one physical lens for both is accurate, not a
      // simplification.
      const makeLensMat = () =>
        new THREE.MeshStandardMaterial({
          color: LENS_OFF,
          emissive: '#000000',
          side: THREE.DoubleSide,
        })
      const placeLens = (geom: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, x: number) => {
        const lens = new THREE.Mesh(geom, mat)
        lens.position.set(HEAD_ALONG + x, HEAD_CENTRE_Y, 0.46)
        mast.add(lens)
      }
      const redCircle = makeLensMat()
      const amberCircle = makeLensMat()
      const combinedArrow = makeLensMat()
      const rightArrow = makeLensMat()
      placeLens(discGeom, redCircle, LENS_X[0])
      placeLens(discGeom, amberCircle, LENS_X[1])
      placeLens(combinedGeom, combinedArrow, LENS_X[2])
      placeLens(rightGeom, rightArrow, LENS_X[3])
      const arrows = [combinedArrow, rightArrow]

      const stopAt = Math.sign(a.kerb[a.vertical ? 1 : 0]) * (JUNCTION_HALF - 0.6)
      const bars = a.lanePos.map((lanePos, i) => {
        const mat = new THREE.MeshStandardMaterial({ color: LENS_OFF, emissive: '#000000' })
        const bar = new THREE.Mesh(a.vertical ? barNS : barEW, mat)
        bar.position.set(
          a.vertical ? lanePos : stopAt,
          PAINT_Y + 0.02,
          a.vertical ? stopAt : lanePos,
        )
        scene.add(bar)
        return { lane: `${a.arm}_in_${i}`, mat }
      })

      heads.push({ lanes: [0, 1, 2].map((i) => `${a.arm}_in_${i}`), redCircle, amberCircle, arrows, bars })
      scene.add(mast)
    }

    // ---- vehicles --------------------------------------------------------
    // Bodies are built per SUMO vehicle type, so a bus is a bus. Geometry
    // and material are cached by type and shared between every vehicle of
    // it — a hundred motorcycles cost one geometry, not a hundred.
    const paintCache = new Map<string, THREE.MeshStandardMaterial>()
    const glassMat = own(new THREE.MeshStandardMaterial({ color: '#1c2633', roughness: 0.08, metalness: 0.6, envMap: envTex, envMapIntensity: 1.2 }))
    const headMat = own(new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff4c8', emissiveIntensity: 0.9, roughness: 0.2 }))
    const tailMat = own(new THREE.MeshStandardMaterial({ color: '#c01020', emissive: '#ff1a2a', emissiveIntensity: 0.7, roughness: 0.3 }))
    const trimMat = own(new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.6, metalness: 0.2 }))
    const hubMat = own(new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.3, metalness: 0.8, envMap: envTex }))
    const lampGeom = own(new THREE.BoxGeometry(1, 1, 1))
    // A soft contact shadow under every vehicle: one radial texture, one
    // plane geometry, scaled per vehicle — far cheaper than real shadows.
    const shadowTex = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 64
      const g = c.getContext('2d')!
      const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32)
      grad.addColorStop(0, 'rgba(0,0,0,0.55)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, 64, 64)
      return own(new THREE.CanvasTexture(c))
    })()
    const shadowMat = own(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }))
    const shadowGeom = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
    function shadowFor(shape: VehicleShape): THREE.Mesh {
      const m = new THREE.Mesh(shadowGeom, shadowMat)
      m.scale.set(shape.width * 1.5, 1, shape.length * 1.25)
      m.position.y = 0.035
      m.renderOrder = -1
      return m
    }
    /** A pair of lamps across the front (head) or back (tail) of a body. */
    function lampPair(mat: THREE.Material, halfW: number, y: number, z: number, size: [number, number, number]): THREE.Mesh[] {
      return [-1, 1].map((side) => {
        const m = new THREE.Mesh(lampGeom, mat)
        m.scale.set(...size)
        m.position.set(side * halfW, y, z)
        return m
      })
    }
    /**
     * A car's side profile, extruded across its width with softened edges:
     * bumper, bonnet, raked windscreen, roof, rear window, boot. Length along
     * +z (front), height up +y, centred on x. Built in the (u = along, v = up)
     * plane and turned so u runs to +z.
     */
    function carProfile(L: number, H: number, W: number, inset = 0): THREE.BufferGeometry {
      const sh = new THREE.Shape()
      const u = (f: number) => f * L
      const v = (f: number) => f * H
      sh.moveTo(u(-0.5), v(0.18))
      sh.lineTo(u(-0.5), v(0.5))
      sh.quadraticCurveTo(u(-0.49), v(0.56), u(-0.42), v(0.57))
      sh.lineTo(u(-0.3), v(0.58))
      sh.quadraticCurveTo(u(-0.24), v(0.93), u(-0.16), v(0.97))
      sh.lineTo(u(0.08), v(0.98))
      sh.quadraticCurveTo(u(0.15), v(0.95), u(0.24), v(0.62))
      sh.lineTo(u(0.44), v(0.55))
      sh.quadraticCurveTo(u(0.5), v(0.52), u(0.5), v(0.42))
      sh.lineTo(u(0.5), v(0.18))
      sh.quadraticCurveTo(u(0.5), v(0.04), u(0.44), v(0.04))
      sh.lineTo(u(-0.44), v(0.04))
      sh.quadraticCurveTo(u(-0.5), v(0.04), u(-0.5), v(0.18))
      const bevel = Math.min(0.08, W * 0.06)
      const geo = new THREE.ExtrudeGeometry(sh, {
        depth: W - bevel * 2 - inset,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 3,
        curveSegments: 8,
      })
      geo.rotateY(-Math.PI / 2)
      geo.translate((W - bevel * 2 - inset) / 2, 0, 0)
      return geo
    }
    /** The glasshouse: side windows and both screens, proud of the body. */
    function carGlass(L: number, H: number, W: number): THREE.BufferGeometry {
      const sh = new THREE.Shape()
      const u = (f: number) => f * L
      const v = (f: number) => f * H
      sh.moveTo(u(-0.285), v(0.6))
      sh.quadraticCurveTo(u(-0.23), v(0.9), u(-0.155), v(0.935))
      sh.lineTo(u(0.075), v(0.945))
      sh.quadraticCurveTo(u(0.14), v(0.915), u(0.225), v(0.64))
      sh.lineTo(u(-0.285), v(0.6))
      const geo = new THREE.ExtrudeGeometry(sh, { depth: W + 0.02, bevelEnabled: false, curveSegments: 6 })
      geo.rotateY(-Math.PI / 2)
      geo.translate((W + 0.02) / 2, 0, 0)
      return geo
    }
    const rubberMat = own(new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }))
    const canopyMat = own(new THREE.MeshStandardMaterial({ color: '#1f1f1f', roughness: 0.8 }))
    // Wheels, shared: a motorcycle's two and an auto-rickshaw's three.
    const wheelGeom = own(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 14))
    const smallWheelGeom = own(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 14))
    const bigWheelGeom = own(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16))
    const chassisMat = own(new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.85 }))

    // Per-kind part geometries, built once per (kind, dimensions) and
    // shared by every vehicle of that type. +z is the front of a group.
    interface BodyParts {
      body: THREE.BufferGeometry
      cab: THREE.BufferGeometry | null
      screen: THREE.BufferGeometry | null
      windows: THREE.BufferGeometry | null
      cargo: THREE.BufferGeometry | null
      chassis: THREE.BufferGeometry | null
    }
    const bodyCache = new Map<string, BodyParts>()
    function bodyFor(shape: VehicleShape): BodyParts {
      const key = `${shape.kind}:${shape.length}:${shape.width}:${shape.height}`
      const hit = bodyCache.get(key)
      if (hit) return hit
      const { length: L, width: Wd, height: Ht, kind } = shape
      let built: BodyParts
      if (kind === 'truck' || (kind === 'emergency' && L >= 8)) {
        // A tractor cab up front and a taller cargo box behind it, on a
        // low chassis; the box is the vType colour, the cab a shade darker.
        const cabL = L * 0.27
        built = {
          body: own(new RoundedBoxGeometry(Wd * 0.94, Ht * 0.58, cabL, 3, 0.18)), // the cab
          cab: null,
          screen: own(new THREE.BoxGeometry(Wd * 0.8, Ht * 0.22, 0.08)),
          windows: null,
          cargo: own(new RoundedBoxGeometry(Wd, Ht * 0.78, L - cabL - 0.3, 3, 0.12)),
          chassis: own(new THREE.BoxGeometry(Wd * 0.8, 0.35, L * 0.96)),
        }
      } else if (kind === 'bus') {
        // One long body with a dark window band along both sides and a
        // windscreen across the front.
        built = {
          body: own(new RoundedBoxGeometry(Wd, Ht * 0.84, L, 3, 0.3)),
          cab: null,
          screen: own(new THREE.BoxGeometry(Wd * 0.9, Ht * 0.34, 0.08)),
          windows: own(new THREE.BoxGeometry(Wd + 0.04, Ht * 0.3, L * 0.86)),
          cargo: null,
          chassis: own(new THREE.BoxGeometry(Wd * 0.85, 0.3, L * 0.9)),
        }
      } else {
        // A car (and the smaller emergency vehicles): a lower body with a
        // glazed cabin on top, wheels below.
        // A real side profile (carProfile) and a glasshouse proud of it.
        built = {
          body: own(carProfile(L, Ht * 0.92, Wd)),
          cab: own(carGlass(L, Ht * 0.92, Wd)),
          screen: null,
          windows: null,
          cargo: null,
          chassis: null,
        }
      }
      bodyCache.set(key, built)
      return built
    }

    function shade(colour: string, factor: number): string {
      const c = new THREE.Color(colour)
      c.multiplyScalar(factor)
      return '#' + c.getHexString()
    }

    function paintFor(colour: string) {
      const hit = paintCache.get(colour)
      if (hit) return hit
      const mat = own(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.25, envMap: envTex, envMapIntensity: 0.7 }))
      paintCache.set(colour, mat)
      return mat
    }

    const hubGeom = own(new THREE.CylinderGeometry(0.62, 0.62, 1.04, 14))
    function wheel(geom: THREE.BufferGeometry, x: number, y: number, z: number) {
      const m = new THREE.Mesh(geom, rubberMat)
      m.rotation.z = Math.PI / 2
      m.position.set(x, y, z)
      // hubcap: a bright disc inset in the tyre, scaled to it
      const p = (geom as THREE.CylinderGeometry).parameters
      if (p) {
        const hub = new THREE.Mesh(hubGeom, hubMat)
        hub.scale.set(p.radiusTop, p.height, p.radiusTop)
        m.add(hub)
      }
      return m
    }

    // Part geometries per shape key, like bodyFor: built once per vehicle
    // TYPE, not per vehicle, so a busy run never accumulates geometry.
    const partsCache = new Map<string, Record<string, THREE.BufferGeometry>>()
    function partsFor(shape: VehicleShape, build: () => Record<string, THREE.BufferGeometry>) {
      const key = `${shape.kind}:${shape.length}:${shape.width}:${shape.height}`
      let hit = partsCache.get(key)
      if (!hit) {
        hit = build()
        for (const g of Object.values(hit)) own(g)
        partsCache.set(key, hit)
      }
      return hit
    }

    /** Two wheels, a narrow frame, a rider - a motorcycle at 2.0 x 0.7 m. */
    function buildMotorcycle(shape: VehicleShape): THREE.Group {
      const g = new THREE.Group()
      const { length: L, colour } = shape
      const coat = paintFor(colour)
      const parts = partsFor(shape, () => ({
        frame: new THREE.BoxGeometry(0.3, 0.3, L * 0.7),
        tank: new THREE.BoxGeometry(0.34, 0.26, L * 0.28),
        rider: new THREE.BoxGeometry(0.4, 0.62, 0.42),
        helmet: new THREE.BoxGeometry(0.26, 0.26, 0.26),
      }))
      const frame = new THREE.Mesh(parts.frame, coat)
      frame.position.y = 0.55
      const tank = new THREE.Mesh(parts.tank, coat)
      tank.position.set(0, 0.78, L * 0.12)
      const rider = new THREE.Mesh(parts.rider, canopyMat)
      rider.position.set(0, 1.05, -L * 0.08)
      const helmet = new THREE.Mesh(parts.helmet, coat)
      helmet.position.set(0, 1.48, -L * 0.08)
      g.add(frame, tank, rider, helmet, wheel(wheelGeom, 0, 0.31, L * 0.36), wheel(wheelGeom, 0, 0.31, -L * 0.36))
      return g
    }

    /** Three wheels, a short tall cab, a canopy - an auto-rickshaw at 2.6 x 1.4 m. */
    function buildRickshaw(shape: VehicleShape): THREE.Group {
      const g = new THREE.Group()
      const { length: L, width: Wd, height: Ht, colour } = shape
      const coat = paintFor(colour)
      const parts = partsFor(shape, () => ({
        cab: new RoundedBoxGeometry(Wd, Ht * 0.7, L * 0.7, 3, 0.15),
        nose: new THREE.BoxGeometry(Wd * 0.5, Ht * 0.45, L * 0.3),
        canopy: new THREE.BoxGeometry(Wd * 1.04, 0.08, L * 0.8),
        screen: new THREE.BoxGeometry(Wd * 0.8, Ht * 0.3, 0.05),
      }))
      const cab = new THREE.Mesh(parts.cab, coat)
      cab.position.set(0, Ht * 0.5, -L * 0.08)
      const nose = new THREE.Mesh(parts.nose, coat)
      nose.position.set(0, Ht * 0.38, L * 0.35)
      const canopy = new THREE.Mesh(parts.canopy, canopyMat)
      canopy.position.set(0, Ht - 0.04, -L * 0.06)
      const screen = new THREE.Mesh(parts.screen, glassMat)
      screen.position.set(0, Ht * 0.7, L * 0.27)
      g.add(
        cab, nose, canopy, screen,
        wheel(smallWheelGeom, 0, 0.24, L * 0.42),
        wheel(smallWheelGeom, Wd * 0.44, 0.24, -L * 0.3),
        wheel(smallWheelGeom, -Wd * 0.44, 0.24, -L * 0.3),
      )
      return g
    }

    function buildVehicle(shape: VehicleShape, typeId: string): THREE.Group {
      if (shape.kind === 'motorcycle') return buildMotorcycle(shape)
      if (shape.kind === 'rickshaw') return buildRickshaw(shape)
      if (shape.kind === 'emergency') return buildEmergency(shape, typeId)
      const g = new THREE.Group()
      const { length: L, width: Wd, height: Ht } = shape
      const parts = bodyFor(shape)
      const coat = paintFor(shape.colour)
      const R = parts.cargo || parts.windows ? 0.5 : 0.31 // wheel radius: big for bus/truck
      const wheelG = parts.cargo || parts.windows ? bigWheelGeom : wheelGeom
      const axle = R

      if (parts.cargo) {
        // Truck: chassis, cab (darker), cargo box, six wheels.
        const cabL = L * 0.27
        const chassis = new THREE.Mesh(parts.chassis!, chassisMat)
        chassis.position.y = R * 0.9
        const cab = new THREE.Mesh(parts.body, paintFor(shade(shape.colour, 0.75)))
        cab.position.set(0, R + Ht * 0.29, L / 2 - cabL / 2)
        const screen = new THREE.Mesh(parts.screen!, glassMat)
        screen.position.set(0, R + Ht * 0.42, L / 2 - 0.04)
        const cargo = new THREE.Mesh(parts.cargo, coat)
        cargo.position.set(0, R + Ht * 0.39, -cabL / 2 - 0.15)
        g.add(chassis, cab, screen, cargo)
        g.add(...lampPair(headMat, Wd * 0.34, R + Ht * 0.12, L / 2 + 0.02, [0.32, 0.18, 0.06]))
        g.add(...lampPair(tailMat, Wd * 0.4, R + 0.25, -L / 2 + 0.12, [0.22, 0.14, 0.06]))
        for (const z of [L * 0.36, -L * 0.18, -L * 0.36]) {
          g.add(wheel(wheelG, Wd * 0.42, axle, z), wheel(wheelG, -Wd * 0.42, axle, z))
        }
      } else if (parts.windows) {
        // Bus: body, window band, windscreen, four wheels.
        const chassis = new THREE.Mesh(parts.chassis!, chassisMat)
        chassis.position.y = R * 0.9
        const body = new THREE.Mesh(parts.body, coat)
        body.position.y = R + Ht * 0.42
        const band = new THREE.Mesh(parts.windows, glassMat)
        band.position.set(0, R + Ht * 0.58, -L * 0.03)
        const screen = new THREE.Mesh(parts.screen!, glassMat)
        screen.position.set(0, R + Ht * 0.55, L / 2 + 0.01)
        const board = new THREE.Mesh(lampGeom, headMat)
        board.scale.set(Wd * 0.6, 0.22, 0.05)
        board.position.set(0, R + Ht * 0.78, L / 2 + 0.02)
        g.add(chassis, body, band, screen, board)
        g.add(...lampPair(headMat, Wd * 0.36, R + Ht * 0.12, L / 2 + 0.02, [0.3, 0.18, 0.06]))
        g.add(...lampPair(tailMat, Wd * 0.4, R + Ht * 0.2, -L / 2 - 0.02, [0.2, 0.3, 0.06]))
        for (const z of [L * 0.32, -L * 0.3]) {
          g.add(wheel(wheelG, Wd * 0.42, axle, z), wheel(wheelG, -Wd * 0.42, axle, z))
        }
      } else {
        // Car: profiled body, glasshouse, bumpers, lamps, four wheels.
        const base = R * 0.55
        const body = new THREE.Mesh(parts.body, coat)
        body.position.y = base
        const glass = new THREE.Mesh(parts.cab!, glassMat)
        glass.position.y = base
        const bumperF = new THREE.Mesh(lampGeom, trimMat)
        bumperF.scale.set(Wd * 0.96, 0.16, 0.12)
        bumperF.position.set(0, base + Ht * 0.18, L / 2 + 0.02)
        const bumperR = bumperF.clone()
        bumperR.position.z = -L / 2 - 0.02
        g.add(body, glass, bumperF, bumperR)
        g.add(...lampPair(headMat, Wd * 0.34, base + Ht * 0.4, L / 2 + 0.01, [0.3, 0.1, 0.05]))
        g.add(...lampPair(tailMat, Wd * 0.36, base + Ht * 0.42, -L / 2 - 0.01, [0.26, 0.1, 0.05]))
        for (const z of [L * 0.32, -L * 0.32]) {
          g.add(wheel(wheelG, Wd * 0.44, axle, z), wheel(wheelG, -Wd * 0.44, axle, z))
        }
      }
      return g
    }

    /**
     * Ambulance, fire engine, police: their own paint over the vType's
     * colour, a roof light bar with two lamps the render loop blinks, and
     * a body shape that reads as what it is - a high white van, a red
     * truck, a dark saloon. Geometry per type is shared like the others.
     */
    const beaconGeom = own(new THREE.BoxGeometry(0.5, 0.22, 0.4))
    const barGeom = own(new THREE.BoxGeometry(1.5, 0.12, 0.45))
    const barMat = own(new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.8 }))

    // A static hazard marker over a stalled vehicle (isStalledVehicleId) -
    // the scripted accident truck, or one stalled on demand - so it reads
    // as broken down rather than merely waiting at red. Not blinking, so
    // it needs no exception to the no-looping-motion rule. The real
    // road-sign triangle - yellow, black rounded outline, black bar-and-
    // dot, transparent everywhere else - drawn once onto a canvas and
    // used as a sprite, which three.js always faces to the camera on its
    // own: the one marker that has to read correctly from any orbit
    // angle, so a flat mesh (which would vanish edge-on) is the wrong
    // shape for the job.
    function buildHazardTexture(): THREE.CanvasTexture {
      const size = 128
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.beginPath()
      ctx.moveTo(size * 0.5, size * 0.06)
      ctx.lineTo(size * 0.95, size * 0.91)
      ctx.lineTo(size * 0.05, size * 0.91)
      ctx.closePath()
      ctx.fillStyle = '#FFC400'
      ctx.fill()
      ctx.lineWidth = size * 0.08
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#000000'
      ctx.stroke()
      ctx.fillStyle = '#000000'
      const bx = size * 0.435, by = size * 0.28, bw = size * 0.13, bh = size * 0.33, br = size * 0.065
      ctx.beginPath()
      ctx.moveTo(bx + br, by)
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, br)
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, br)
      ctx.arcTo(bx, by + bh, bx, by, br)
      ctx.arcTo(bx, by, bx + bw, by, br)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.arc(size * 0.5, size * 0.775, size * 0.075, 0, Math.PI * 2)
      ctx.fill()
      const texture = new THREE.CanvasTexture(canvas)
      texture.needsUpdate = true
      return texture
    }
    const hazardTexture = own(buildHazardTexture())
    const hazardMat = own(new THREE.SpriteMaterial({ map: hazardTexture, transparent: true, depthWrite: false }))

    // Smoke, once a stalled vehicle has actually stopped (the render loop
    // gates this on its current speed, not just its id): a handful of
    // puffs per vehicle rising and fading on a loop, big and dark enough
    // to read against the asphalt. A second exception to the
    // no-looping-motion rule, made the same way the beacons were - it
    // reports "broken down right now", not decoration. One shared
    // geometry, an owned material PER PUFF (opacity is animated per puff,
    // so it cannot share one) - cheap, since at most a vehicle or two on
    // screen is ever stalled at once.
    const smokeGeom = own(new THREE.SphereGeometry(0.55, 10, 10))
    const SMOKE_RISE = 3.2 // metres climbed over one cycle
    const SMOKE_CYCLE = 2.4 // seconds
    const SMOKE_DX = [0, 0.5, -0.4, 0.3, -0.6] // horizontal spread per puff, a real cloud rather than a column
    const emergencyGeom = new Map<string, THREE.BufferGeometry[]>()
    function emergencyParts(typeId: string, shape: VehicleShape): THREE.BufferGeometry[] {
      const hit = emergencyGeom.get(typeId)
      if (hit) return hit
      const { length: L, width: Wd, height: Ht } = shape
      const livery = EMERGENCY_PAINT[typeId] ?? EMERGENCY_PAINT.ambulance
      let parts: THREE.BufferGeometry[]
      if (livery.kind === 'van') {
        parts = [
          own(new THREE.BoxGeometry(Wd, Ht * 0.62, L)), // body
          own(new THREE.BoxGeometry(Wd + 0.02, Ht * 0.14, L * 0.7)), // band
          own(new THREE.BoxGeometry(Wd * 0.9, Ht * 0.3, 0.08)), // screen
        ]
      } else if (livery.kind === 'truck') {
        parts = [
          own(new THREE.BoxGeometry(Wd, Ht * 0.62, L)),
          own(new THREE.BoxGeometry(Wd + 0.02, Ht * 0.1, L * 0.8)),
          own(new THREE.BoxGeometry(Wd * 0.9, Ht * 0.26, 0.08)),
          own(new THREE.BoxGeometry(0.3, 0.2, L * 0.55)), // ladder
        ]
      } else {
        parts = [
          own(new THREE.BoxGeometry(Wd, Ht * 0.5, L)),
          own(new THREE.BoxGeometry(Wd + 0.02, Ht * 0.16, L * 0.34)), // white doors
          own(new THREE.BoxGeometry(Wd * 0.86, Ht * 0.42, L * 0.46)), // cabin
        ]
      }
      emergencyGeom.set(typeId, parts)
      return parts
    }
    function buildEmergency(shape: VehicleShape, typeId: string): THREE.Group {
      const g = new THREE.Group()
      const { length: L, width: Wd, height: Ht } = shape
      const livery = EMERGENCY_PAINT[typeId] ?? EMERGENCY_PAINT.ambulance
      const parts = emergencyParts(typeId, shape)
      const R = livery.kind === 'car' ? 0.31 : 0.42
      const wheelG = livery.kind === 'car' ? wheelGeom : bigWheelGeom
      const body = new THREE.Mesh(parts[0], paintFor(livery.body))
      const band = new THREE.Mesh(parts[1], paintFor(livery.band ?? livery.body))
      let roofY: number
      if (livery.kind === 'car') {
        body.position.y = R + Ht * 0.25
        band.position.set(0, R + Ht * 0.25, 0)
        const cabin = new THREE.Mesh(parts[2], glassMat)
        cabin.position.set(0, R + Ht * 0.5 + Ht * 0.21, -L * 0.04)
        g.add(body, band, cabin)
        roofY = R + Ht * 0.5 + Ht * 0.42
      } else {
        body.position.y = R + Ht * 0.31
        band.position.set(0, R + Ht * 0.31, 0)
        const screen = new THREE.Mesh(parts[2], glassMat)
        screen.position.set(0, R + Ht * 0.45, L / 2 + 0.01)
        g.add(body, band, screen)
        if (livery.kind === 'truck') {
          const ladder = new THREE.Mesh(parts[3], paintFor('#d9d9d9'))
          ladder.position.set(0, R + Ht * 0.62 + 0.1, -L * 0.15)
          g.add(ladder)
        }
        roofY = R + Ht * 0.62
      }
      const bar = new THREE.Mesh(barGeom, barMat)
      bar.position.set(0, roofY + 0.06, livery.kind === 'car' ? 0 : L * 0.3)
      const [ca, cb] = BEACONS[typeId] ?? BEACONS.ambulance
      const ma = new THREE.MeshStandardMaterial({ color: ca, emissive: ca, emissiveIntensity: 1.2, roughness: 0.3 })
      const mb = new THREE.MeshStandardMaterial({ color: cb, emissive: cb, emissiveIntensity: 0.1, roughness: 0.3 })
      const la = new THREE.Mesh(beaconGeom, ma)
      const lb = new THREE.Mesh(beaconGeom, mb)
      la.position.set(-0.4, roofY + 0.22, bar.position.z)
      lb.position.set(0.4, roofY + 0.22, bar.position.z)
      g.add(bar, la, lb)
      g.userData.beacons = [ma, mb]
      for (const z of [L * 0.32, -L * 0.32]) {
        g.add(wheel(wheelG, Wd * 0.44, R, z), wheel(wheelG, -Wd * 0.44, R, z))
      }
      return g
    }

    const cars = new Map<string, Car>()
    const fleet = new THREE.Group()
    scene.add(fleet)

    // ---- rain --------------------------------------------------------
    // Reports the sim's own weather (the Rain scenario) rather than
    // decorating the scene, the same reasoning as the plate's own rain
    // layer. Streaks are short line segments that fall at a constant real
    // rate and respawn at the top when they pass the ground — driven here
    // rather than by CSS because three.js has no keyframe loop to hook.
    const RAIN_COUNT = 900
    const RAIN_HALF = 220 // covers the network with margin at any orbit
    const RAIN_HEIGHT = 90
    const RAIN_FALL = 140 // m/s, exaggerated so it reads at this scale
    const RAIN_LEN = 3.2 // streak length
    const RAIN_DRIFT = 0.6 // sideways offset over that length - a wind-slant
    const rainPositions = new Float32Array(RAIN_COUNT * 2 * 3)
    const dropY = new Float32Array(RAIN_COUNT)
    const setDrop = (i: number, x: number, y: number, z: number) => {
      const o = i * 6
      rainPositions[o] = x
      rainPositions[o + 1] = y
      rainPositions[o + 2] = z
      rainPositions[o + 3] = x - RAIN_DRIFT
      rainPositions[o + 4] = y - RAIN_LEN
      rainPositions[o + 5] = z
      dropY[i] = y
    }
    for (let i = 0; i < RAIN_COUNT; i++) {
      setDrop(i, (Math.random() * 2 - 1) * RAIN_HALF, Math.random() * RAIN_HEIGHT, (Math.random() * 2 - 1) * RAIN_HALF)
    }
    const rainGeom = own(new THREE.BufferGeometry())
    rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3))
    const rainMat = own(new THREE.LineBasicMaterial({ color: '#bcd2e6', transparent: true, opacity: 0.4 }))
    const rain = new THREE.LineSegments(rainGeom, rainMat)
    rain.visible = false
    scene.add(rain)
    let lastRainTick = performance.now()

    let raf = 0
    // The display clock and the poses sampled from the motion buffer
    // each frame (data/motion.ts) - the same mechanism as the plate's
    // VehicleLayer, so the two views move identically.
    const clock = new DisplayClock()
    const poses = new Map<string, Pose>()

    const resize = () => {
      const w = el.clientWidth || 1
      const h = el.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    const setLens = (mat: THREE.MeshStandardMaterial, colour: string | null) => {
      mat.color.set(colour ?? LENS_OFF)
      mat.emissive.set(colour ?? '#000000')
      mat.emissiveIntensity = colour ? 1 : 0
    }

    const tick = () => {
      const now = performance.now()
      const { lanes: ls, powered: on, motionSide: side } = data.current

      // A STOPPED run clears, and it has to happen out here rather than
      // in the tick-gated block below: when the run ends, sim_time stops
      // changing, so that block never runs again and the last frame's
      // traffic would sit on the model forever.
      const clearFleet = () => {
        for (const c of cars.values()) fleet.remove(c.group)
        cars.clear()
      }
      if (!on && cars.size > 0) clearFleet()

      // ---- signals ----
      // The hardware design (Section 34.1, confirmed with the owner): the
      // left and straight movements on one approach always run in the same
      // phase together on this junction, so they share ONE arrow lens
      // (head.arrows[0], the combined glyph) - never two independently-lit
      // pictograms. The right turn keeps its own arrow (head.arrows[1]).
      // Either arrow carries its own movement's red/amber/green for as
      // long as anything else on the same approach is still green. Only
      // once NOTHING on the whole approach is green does it collapse to
      // the two shared circles - arrows dark, one plain red (waiting its
      // turn) or one plain amber (the approach's last green just ended) -
      // because at that point separate reds would say nothing one shared
      // bulb cannot already say, and a real signal head only needs the one
      // bulb. This is deliberately read fresh from the CURRENT tick only,
      // with no lookahead into the next phase - exactly what physical
      // hardware reading live signal state would have available too.
      const byLane = new Map(ls.map((l) => [l.lane_id, l]))
      const lampFor = (id: string) => (on ? lampOf(byLane.get(id)?.signal ?? 'r') : 'off')
      for (const head of heads) {
        const lamps = head.lanes.map(lampFor) // [left, straight, right]
        const dark = lamps[0] === 'off'
        const anyGreen = lamps.includes('green')
        const anyAmber = lamps.includes('amber')
        const wholeApproachQuiet = !anyGreen
        setLens(head.redCircle, !dark && wholeApproachQuiet && !anyAmber ? RED : null)
        setLens(head.amberCircle, !dark && wholeApproachQuiet && anyAmber ? AMBER : null)
        // left and straight are the same phase, so either lamp reads the
        // combined arrow's true state; take whichever is most "active" as
        // a defensive tie-break rather than assuming they can never differ.
        const rank = { green: 2, amber: 1, red: 0, off: -1 } as const
        const combinedLamp = rank[lamps[0]] >= rank[lamps[1]] ? lamps[0] : lamps[1]
        const arrowLamps = [combinedLamp, lamps[2]]
        arrowLamps.forEach((lamp, i) => {
          const colour =
            dark || wholeApproachQuiet
              ? null
              : lamp === 'green'
                ? GREEN
                : lamp === 'amber'
                  ? AMBER
                  : RED
          setLens(head.arrows[i], colour)
        })
        for (const bar of head.bars) {
          const lamp = lampFor(bar.lane)
          setLens(bar.mat, lamp === 'red' ? RED : lamp === 'amber' ? AMBER : lamp === 'green' ? GREEN : null)
        }
      }

      // ---- traffic, from the motion buffer at the display clock ----
      // Positions and headings are SUMO's own, interpolated between the
      // two frames that bracket the display time; nothing is derived
      // from movement any more. SUMO's angle is degrees clockwise from
      // north; this scene's z runs SOUTH (z = CENTRE − y) and a group
      // faces (sin θ, cos θ) in (x, z), so north is θ = π and the map is
      // θ = π − angle. (Mapping it straight faced every N/S vehicle
      // backwards, and pushed its body across the stop line.)
      const buffer = motionBuffer(side)
      const tau = on ? clock.advance(now, buffer, data.current.rate, data.current.smooth) : null
      if (tau === null) {
        if (cars.size > 0) clearFleet()
      } else {
        buffer.sample(tau, poses)
        for (const p of poses.values()) {
          let car = cars.get(p.id)
          if (car && car.type !== (p.type ?? '')) {
            // Type changed under the same id (id reuse): rebuild it.
            fleet.remove(car.group)
            cars.delete(p.id)
            car = undefined
          }
          if (!car) {
            const shape = shapeOf(p.type)
            const group = buildVehicle(shape, p.type ?? '')
            group.add(shadowFor(shape))
            let smoke: Car['smoke']
            if (isStalledVehicleId(p.id)) {
              const hazard = new THREE.Sprite(hazardMat)
              hazard.scale.set(1.2, 1.2, 1)
              hazard.position.set(0, shape.height + 0.75, 0)
              group.add(hazard)
              const riseFrom = shape.height * 0.6
              smoke = [0, 0.6, 1.2, 1.8, 2.2].map((phase, i) => {
                const mat = own(new THREE.MeshStandardMaterial({ color: '#b5b5b5', transparent: true, opacity: 0, roughness: 1 }))
                const mesh = new THREE.Mesh(smokeGeom, mat)
                mesh.position.set(shape.length * 0.28 + SMOKE_DX[i], riseFrom, 0)
                mesh.visible = false
                group.add(mesh)
                return { mesh, mat, phase, riseFrom }
              })
            }
            fleet.add(group)
            car = { group, type: p.type ?? '', halfLength: shape.length / 2, beacons: group.userData.beacons, smoke }
            cars.set(p.id, car)
          }
          const heading = Math.PI - (p.angle * Math.PI) / 180
          const bx = p.x - CENTRE
          const bz = CENTRE - p.y
          // The snapshot coordinate is the front bumper; the body sits
          // half a length behind it, or it would overhang the stop bar.
          car.group.position.x = bx - Math.sin(heading) * car.halfLength
          car.group.position.z = bz - Math.cos(heading) * car.halfLength
          car.group.rotation.y = heading
          // Smoke only while actually stalled (not just "is the stalled
          // vehicle") - not while it is still driving toward its stop
          // point, and not once it moves off again at the end of its hold.
          if (car.smoke) {
            const stalled = p.speed < 0.3
            for (const puff of car.smoke) {
              puff.mesh.visible = stalled
              if (!stalled) continue
              const t = (((now / 1000 + puff.phase) % SMOKE_CYCLE) / SMOKE_CYCLE)
              puff.mesh.position.y = puff.riseFrom + t * SMOKE_RISE
              puff.mesh.scale.setScalar(0.6 + t * 2.2)
              puff.mat.opacity = t < 0.25 ? (t / 0.25) * 0.85 : 0.85 * (1 - (t - 0.25) / 0.75)
            }
          }
        }
        for (const [id, c] of cars) {
          if (!poses.has(id)) {
            fleet.remove(c.group)
            cars.delete(id)
          }
        }
        // Light bars: the two lamps alternate at 2 Hz.
        const lit = Math.floor(now / 250) % 2 === 0
        for (const c of cars.values()) {
          if (!c.beacons) continue
          c.beacons[0].emissiveIntensity = lit ? 1.4 : 0.08
          c.beacons[1].emissiveIntensity = lit ? 0.08 : 1.4
        }
      }

      // ---- rain: real-time, independent of sim speed - it is weather,
      // not simulated physics, so it falls at its own constant rate.
      const isRaining = data.current.raining
      rain.visible = isRaining
      if (isRaining) {
        const dt = Math.min(0.05, (now - lastRainTick) / 1000)
        for (let i = 0; i < RAIN_COUNT; i++) {
          const o = i * 6
          let y = dropY[i] - RAIN_FALL * dt
          const x = y > 0 ? rainPositions[o] : (Math.random() * 2 - 1) * RAIN_HALF
          const z = y > 0 ? rainPositions[o + 2] : (Math.random() * 2 - 1) * RAIN_HALF
          if (y <= 0) y = RAIN_HEIGHT
          setDrop(i, x, y, z)
        }
        rainGeom.attributes.position.needsUpdate = true
      }
      lastRainTick = now

      controls.update()
      // Compass: world north is -z; the camera's azimuth (its angle
      // round the y axis, 0 when it stands on +z looking north) is
      // exactly how far north has turned clockwise on screen.
      if (compass.current) {
        const deg = (controls.getAzimuthalAngle() * 180) / Math.PI
        compass.current.style.transform = `rotate(${deg.toFixed(1)}deg)`
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.removeEventListener('start', stopAuto)
      controls.removeEventListener('end', release)
      renderer.domElement.removeEventListener('wheel', stopAuto)
      controls.dispose()
      for (const o of owned) o.dispose()
      // Per-head lens and bar materials are created individually, so walk
      // the graph too and catch anything not in `owned`.
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mat = o.material
          if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose())
          else mat?.dispose?.()
        }
      })
      envTex.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="relative h-full w-full">
      <div ref={mount} className="h-full w-full" aria-label="Interactive 3D model of the junction" role="img" />
      <div className="map-pill pointer-events-none absolute bottom-3 left-3 rounded-full px-3 py-1.5 text-[12px] text-[var(--plate-ink)]">
        drag to orbit · Ctrl + scroll to zoom · right-drag to pan
      </div>
      {/* The plan view's compass, for the same reason it has one: once
          the model is orbited nothing else says which arm is which. It
          turns with the camera so the arrow stays on north. */}
      <div className="pointer-events-none absolute bottom-[54px] right-1" aria-label="Compass: north">
        {/* Room round the dial for the N, which turns with the needle. */}
        <svg ref={compass} width="54" height="54" viewBox="-27 -27 54 54" style={{ transformOrigin: '50% 50%' }}>
          <circle r="17" fill="#fff" stroke="rgb(27 37 54 / 0.25)" strokeWidth="1" />
          <path d="M 0 -13 L -4.5 0 L 4.5 0 Z" fill="#E5484D" />
          <path d="M 0 13 L -4.5 0 L 4.5 0 Z" fill="#2F6BFF" />
          <text y="-20" textAnchor="middle" fontSize="9.5" fontWeight="700" fontFamily="var(--font-num)" fill="var(--plate-ink)" stroke="#fff" strokeWidth="2.5" paintOrder="stroke">
            N
          </text>
        </svg>
      </div>
    </div>
  )
}
