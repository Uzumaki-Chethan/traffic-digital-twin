import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { LaneView, VehicleView } from '@/data/types'
import { useSim } from '@/data/store'
import { DisplayClock, motionBuffer, type MotionSide, type Pose } from '@/data/motion'
import { lampOf } from '@/utils/signal'
import { BEACONS, shapeOf, type VehicleShape } from './vehicleTypes'

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
const ASPHALT = '#1b1b1b'
const GROUND = '#268426'
const HORIZON = '#0d5410'
const PAINT = '#dcdcdc'
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
}

interface Car {
  group: THREE.Group
  type: string
  /** Half the body length, in metres — the bumper-to-centre offset. */
  halfLength: number
  /** An emergency vehicle's two roof lamps, blinked in the render loop. */
  beacons?: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]
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
/** Four lenses in a row: red, amber, left+ahead, right. */
const LENS_X = [-2.35, -0.8, 0.8, 2.35]

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

const TURN_LEFT = Math.PI
const TURN_AHEAD = Math.PI / 2
const TURN_RIGHT = 0

export function Junction3D({ lanes, powered, motionSide = 'demo' }: Props) {
  const mount = useRef<HTMLDivElement>(null)
  // The compass overlay; turned every frame to keep its arrow on world
  // north however the camera has been orbited.
  const compass = useRef<SVGSVGElement>(null)
  const rate = useSim((s) => s.rate)
  const smooth = useSim((s) => s.smooth)
  const data = useRef({ lanes, powered, motionSide, rate, smooth })
  useEffect(() => {
    data.current = { lanes, powered, motionSide, rate, smooth }
  }, [lanes, powered, motionSide, rate, smooth])

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

    scene.add(new THREE.HemisphereLight(0xffffff, 0x20401a, 1.05))
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
      own(new THREE.PlaneGeometry(NET, NET)),
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
    const solidNS = own(new THREE.BoxGeometry(0.22, 0.08, ARM))
    const solidEW = own(new THREE.BoxGeometry(ARM, 0.08, 0.22))
    for (const off of [-ROAD_HALF, 0, ROAD_HALF]) {
      for (const sign of [-1, 1]) {
        const ns = new THREE.Mesh(solidNS, paint)
        ns.position.set(off, PAINT_Y, sign * ARM_MID)
        const ew = new THREE.Mesh(solidEW, paint)
        ew.position.set(sign * ARM_MID, PAINT_Y, off)
        scene.add(ns, ew)
      }
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
    const headGeom = own(new THREE.BoxGeometry(6.0, 2.0, 0.85))
    const discGeom = own(new THREE.CircleGeometry(0.58, 20))
    const aheadGeom = own(new THREE.ShapeGeometry(arrowShape(TURN_AHEAD)))
    const leftGeom = own(new THREE.ShapeGeometry(arrowShape(TURN_LEFT)))
    const rightGeom = own(new THREE.ShapeGeometry(arrowShape(TURN_RIGHT)))
    const barNS = own(new THREE.BoxGeometry(LANE_W - 0.5, 0.12, 0.75))
    const barEW = own(new THREE.BoxGeometry(0.75, 0.12, LANE_W - 0.5))

    interface Head {
      /** The three inbound lanes this head speaks for, in order 0,1,2. */
      lanes: string[]
      /** red, amber, left+ahead, right — one material each. */
      aspects: THREE.MeshStandardMaterial[]
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

      // Four aspects in a row. Red and amber are discs, the two greens
      // are arrows: one combining left with ahead (they run together in
      // this program), one for the protected right turn.
      const aspects: THREE.MeshStandardMaterial[] = []
      const lensGeoms: (THREE.BufferGeometry | THREE.BufferGeometry[])[] = [
        discGeom,
        discGeom,
        [leftGeom, aheadGeom],
        rightGeom,
      ]
      lensGeoms.forEach((geom, i) => {
        const mat = new THREE.MeshStandardMaterial({
          color: LENS_OFF,
          emissive: '#000000',
          side: THREE.DoubleSide,
        })
        aspects.push(mat)
        const pieces = Array.isArray(geom) ? geom : [geom]
        // The combined aspect is two arrows sharing one material, so
        // lighting it lights both halves together.
        pieces.forEach((g, part) => {
          const lens = new THREE.Mesh(g, mat)
          const nudge = pieces.length > 1 ? (part === 0 ? -0.3 : 0.3) : 0
          const scale = pieces.length > 1 ? 0.72 : 1
          lens.scale.set(scale, scale, 1)
          lens.position.set(HEAD_ALONG + LENS_X[i] + nudge, HEAD_CENTRE_Y, 0.46)
          mast.add(lens)
        })
      })

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

      heads.push({ lanes: [0, 1, 2].map((i) => `${a.arm}_in_${i}`), aspects, bars })
      scene.add(mast)
    }

    // ---- vehicles --------------------------------------------------------
    // Bodies are built per SUMO vehicle type, so a bus is a bus. Geometry
    // and material are cached by type and shared between every vehicle of
    // it — a hundred motorcycles cost one geometry, not a hundred.
    const paintCache = new Map<string, THREE.MeshStandardMaterial>()
    const glassMat = own(new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.25 }))
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
          body: own(new THREE.BoxGeometry(Wd * 0.94, Ht * 0.58, cabL)), // the cab
          cab: null,
          screen: own(new THREE.BoxGeometry(Wd * 0.8, Ht * 0.22, 0.08)),
          windows: null,
          cargo: own(new THREE.BoxGeometry(Wd, Ht * 0.78, L - cabL - 0.3)),
          chassis: own(new THREE.BoxGeometry(Wd * 0.8, 0.35, L * 0.96)),
        }
      } else if (kind === 'bus') {
        // One long body with a dark window band along both sides and a
        // windscreen across the front.
        built = {
          body: own(new THREE.BoxGeometry(Wd, Ht * 0.84, L)),
          cab: null,
          screen: own(new THREE.BoxGeometry(Wd * 0.9, Ht * 0.34, 0.08)),
          windows: own(new THREE.BoxGeometry(Wd + 0.04, Ht * 0.3, L * 0.86)),
          cargo: null,
          chassis: own(new THREE.BoxGeometry(Wd * 0.85, 0.3, L * 0.9)),
        }
      } else {
        // A car (and the smaller emergency vehicles): a lower body with a
        // glazed cabin on top, wheels below.
        built = {
          body: own(new THREE.BoxGeometry(Wd, Ht * 0.5, L)),
          cab: own(new THREE.BoxGeometry(Wd * 0.86, Ht * 0.42, L * 0.46)),
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
      const mat = own(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45 }))
      paintCache.set(colour, mat)
      return mat
    }

    function wheel(geom: THREE.BufferGeometry, x: number, y: number, z: number) {
      const m = new THREE.Mesh(geom, rubberMat)
      m.rotation.z = Math.PI / 2
      m.position.set(x, y, z)
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
        cab: new THREE.BoxGeometry(Wd, Ht * 0.7, L * 0.7),
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
        g.add(chassis, body, band, screen)
        for (const z of [L * 0.32, -L * 0.3]) {
          g.add(wheel(wheelG, Wd * 0.42, axle, z), wheel(wheelG, -Wd * 0.42, axle, z))
        }
      } else {
        // Car: lower body, glazed cabin, four wheels.
        const body = new THREE.Mesh(parts.body, coat)
        body.position.y = R + Ht * 0.25
        const cabin = new THREE.Mesh(parts.cab!, glassMat)
        cabin.position.set(0, R + Ht * 0.5 + Ht * 0.21, -L * 0.04)
        g.add(body, cabin)
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
      const byLane = new Map(ls.map((l) => [l.lane_id, l]))
      const lampFor = (id: string) => (on ? lampOf(byLane.get(id)?.signal ?? 'r') : 'off')
      for (const head of heads) {
        const [left, ahead, right] = head.lanes.map(lampFor)
        const anyAmber = left === 'amber' || ahead === 'amber' || right === 'amber'
        const straightLeft = left === 'green' || ahead === 'green'
        const rightGreen = right === 'green'
        const dark = left === 'off'
        setLens(head.aspects[0], !dark && !anyAmber && !straightLeft && !rightGreen ? RED : null)
        setLens(head.aspects[1], anyAmber ? AMBER : null)
        setLens(head.aspects[2], straightLeft ? GREEN : null)
        setLens(head.aspects[3], rightGreen ? GREEN : null)
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
            fleet.add(group)
            car = { group, type: p.type ?? '', halfLength: shape.length / 2, beacons: group.userData.beacons }
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
      renderer.dispose()
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="relative h-full w-full">
      <div ref={mount} className="h-full w-full" aria-label="Interactive 3D model of the junction" role="img" />
      <div className="pointer-events-none absolute right-3 top-3 rounded-control bg-[rgb(36_26_16/0.72)] px-2 py-1 text-[12px] text-[var(--ink-on-dark)]">
        drag to orbit · Ctrl + scroll to zoom · right-drag to pan
      </div>
      {/* The plan view's compass, for the same reason it has one: once
          the model is orbited nothing else says which arm is which. It
          turns with the camera so the arrow stays on north. */}
      <div className="pointer-events-none absolute right-4 top-12" aria-label="Compass: north">
        <svg ref={compass} width="44" height="44" viewBox="-22 -22 44 44" style={{ transformOrigin: '50% 50%' }}>
          <circle r="18" fill="rgb(36 26 16 / 0.55)" stroke="var(--plate-ink)" strokeWidth="1.2" opacity="0.9" />
          <path d="M 0 -13 L -5 5 L 0 1 L 5 5 Z" fill="var(--plate-ink)" />
          <text y="15" textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="var(--font-num)" fill="var(--plate-ink)">
            N
          </text>
        </svg>
      </div>
    </div>
  )
}
