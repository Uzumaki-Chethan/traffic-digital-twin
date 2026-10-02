import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildCity } from './city/layout'
import { VEHICLES, buildLanes, laneXZ, lightsAt, populate, stepLane, type Lane, type Vehicle, type VehicleKind } from './city/traffic'
import * as S from './city/shaders'

/** The sun, 20° up in the east-north-east: light rakes in from the right of
 * the opening view and every building throws a long morning shadow. */
const SUN_DIR = new THREE.Vector3(0.72, 0.342, -0.604).normalize()
/** Linear, before tone mapping. */
const SUN_COLOR = new THREE.Color(2.5, 1.85, 1.15)
const FOG_DENSITY = 0.00072
const SHADOW_SIZE = 4096
/** The region whose buildings and trees cast shadows. */
const SHADOW_EXTENT = 700

const KINDS: VehicleKind[] = ['car', 'moto', 'auto', 'bus', 'truck']
const PAINTS: Record<VehicleKind, string[]> = {
  car: ['#f1f1ee', '#f1f1ee', '#c6c9ce', '#8b9097', '#2c2f34', '#121315', '#a3171c', '#1e3e8c', '#2e5d39', '#c4b086', '#5c1c24'],
  moto: ['#1b1b1d', '#a3171c', '#1e3e8c', '#c6c9ce', '#2c2f34'],
  auto: ['#2f7d34', '#e2b100', '#2f7d34'],
  bus: ['#c8341f', '#2a64b8', '#e07b14', '#3c8a3f'],
  truck: ['#d9531e', '#1f4e9a', '#c62828', '#efefec'],
}
/** The console's own canopy greens (overview/cityscape.ts). */
const CANOPY = ['#7fb069', '#6fa35b', '#8cbb73', '#5e9650']
const TRUNK = '#6b4f36'

const BODY = 0
const GLASS = 1
const DARK = 2
const LAMP = 3
const CARGO = 4

/** A box of one vehicle part; the part id rides along as an attribute. */
function part(w: number, h: number, d: number, x: number, y: number, z: number, id: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(id), 1))
  return g
}

/** Low-detail vehicles, front towards +x, wheels on y = 0. */
function vehicleGeometry(kind: VehicleKind) {
  const parts = {
    car: [part(4.4, 0.72, 1.8, 0, 0.66, 0, BODY), part(2.3, 0.6, 1.62, -0.25, 1.32, 0, GLASS), part(4.1, 0.34, 1.66, 0, 0.21, 0, DARK), part(0.06, 0.2, 1.5, -2.21, 0.86, 0, LAMP), part(0.06, 0.16, 1.4, 2.21, 0.8, 0, LAMP)],
    moto: [part(1.9, 0.5, 0.45, 0, 0.62, 0, BODY), part(0.5, 0.75, 0.5, -0.2, 1.25, 0, DARK), part(0.32, 0.32, 0.32, -0.12, 1.8, 0, BODY), part(1.7, 0.35, 0.2, 0, 0.22, 0, DARK), part(0.05, 0.12, 0.2, -0.96, 0.8, 0, LAMP)],
    auto: [part(2.7, 0.8, 1.4, 0, 0.62, 0, BODY), part(2.2, 0.72, 1.38, -0.15, 1.38, 0, DARK), part(0.06, 0.5, 1.1, 1.36, 1.22, 0, GLASS), part(2.4, 0.26, 1.2, 0, 0.15, 0, DARK), part(0.05, 0.15, 1, -1.36, 0.8, 0, LAMP)],
    bus: [part(11, 2.3, 2.5, 0, 1.55, 0, BODY), part(10.4, 0.95, 2.54, -0.1, 2.05, 0, GLASS), part(0.06, 1, 2.3, 5.51, 1.95, 0, GLASS), part(10.6, 0.42, 2.3, 0, 0.24, 0, DARK), part(0.06, 0.25, 2.2, -5.51, 0.9, 0, LAMP)],
    truck: [part(2.2, 2.2, 2.4, 3, 1.5, 0, BODY), part(5.9, 2.8, 2.5, -1.15, 1.85, 0, CARGO), part(0.06, 0.8, 2.1, 4.11, 1.95, 0, GLASS), part(8, 0.45, 2.2, 0, 0.32, 0, DARK), part(0.06, 0.25, 2.3, -4.11, 0.9, 0, LAMP)],
  }[kind]
  const g = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return g
}

/** A soft round shadow under each vehicle (cheaper than casting real ones). */
function blobTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32)
    grad.addColorStop(0, 'rgba(0,0,0,0.6)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  }
  return new THREE.CanvasTexture(c)
}

/** Heading (rotation about y) of a lane's traffic; vehicles are built facing +x. */
function heading(lane: Lane) {
  if (lane.axis === 'x') return lane.dir === 1 ? 0 : Math.PI
  return lane.dir === 1 ? -Math.PI / 2 : Math.PI / 2
}

/**
 * The home page's background (Section 48): the same city as before, in the
 * morning — a clear sky with the sun low in the east and a little cloud,
 * long shadows across the streets, glass towers mirroring the sky, street
 * trees and parks, and real traffic: cars, motorbikes, autos, buses and
 * trucks keeping their lanes, queueing at the red and pulling away on the
 * green, the junction's own signals changing at the centre. The camera
 * flies with the page (`progress` 0..1); the pointer adds a little
 * parallax. Purely decorative: none of it is the simulation.
 */
export function MorningCity({ progress, still }: { progress: MutableRefObject<number>; still: boolean }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    } catch {
      return // no WebGL: the CSS sky behind stays
    }
    let pr = Math.min(1.75, window.devicePixelRatio || 1)
    renderer.setPixelRatio(pr)
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1.15
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, 1, 1, 4200)
    const trash: { dispose(): void }[] = []
    const keep = <T extends { dispose(): void }>(x: T) => (trash.push(x), x)
    const city = buildCity()

    // ---- the sun's shadow map (static: rendered once, after the city is built)
    // hardware comparison with linear filtering: smooth shadow edges for the
    // cost of a lookup; the colour attachment is unused, so it is one byte
    const depth = new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE)
    depth.compareFunction = THREE.LessEqualCompare
    depth.minFilter = depth.magFilter = THREE.LinearFilter
    const shadowTarget = keep(new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { format: THREE.RedFormat, depthBuffer: true, depthTexture: depth }))
    const sunCam = new THREE.OrthographicCamera()
    sunCam.position.copy(SUN_DIR).multiplyScalar(2400)
    sunCam.lookAt(0, 0, 0)
    sunCam.updateMatrixWorld()
    {
      const v = new THREE.Vector3()
      const lo = new THREE.Vector3(Infinity, Infinity, Infinity)
      const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
      for (const x of [-SHADOW_EXTENT, SHADOW_EXTENT])
        for (const y of [0, 300])
          for (const z of [-SHADOW_EXTENT, SHADOW_EXTENT]) {
            v.set(x, y, z).applyMatrix4(sunCam.matrixWorldInverse)
            lo.min(v)
            hi.max(v)
          }
      sunCam.left = lo.x
      sunCam.right = hi.x
      sunCam.bottom = lo.y
      sunCam.top = hi.y
      sunCam.near = -hi.z - 10
      sunCam.far = -lo.z + 10
      sunCam.updateProjectionMatrix()
    }
    sunCam.layers.set(1)
    const shadowMatrix = new THREE.Matrix4()
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(sunCam.projectionMatrix)
      .multiply(sunCam.matrixWorldInverse)

    // every shader shares these
    const shared = {
      uSunDir: { value: SUN_DIR },
      uSunColor: { value: SUN_COLOR },
      uFogDensity: { value: FOG_DENSITY },
      uShadowMap: { value: shadowTarget.depthTexture },
      uShadowTexel: { value: 1 / SHADOW_SIZE },
      uShadowMatrix: { value: shadowMatrix },
    }
    const shader = (vertexShader: string, fragmentShader: string, extra: Record<string, THREE.IUniform> = {}, opts: THREE.ShaderMaterialParameters = {}) =>
      keep(new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...shared, ...extra }, ...opts }))

    // ---- sky ----------------------------------------------------------------
    const skyMat = shader(S.SKY_VERT, S.SKY_FRAG, { uTime: { value: 0 }, uClouds: { value: 1 } }, { side: THREE.BackSide, depthWrite: false })
    const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(3000, 48, 24)), skyMat)
    sky.renderOrder = -10
    scene.add(sky)

    // ---- ground: blocks, parks, sidewalks, roads and paint, in one plane
    const parks = city.parks.map((p) => new THREE.Vector4(p.x0, p.z0, p.x1, p.z1))
    while (parks.length < 4) parks.push(new THREE.Vector4(0, 0, 0, 0))
    const groundGeo = keep(new THREE.PlaneGeometry(8000, 8000))
    groundGeo.rotateX(-Math.PI / 2)
    // drawn first and without depth: everything else stands on it, so nothing can z-fight with it
    const ground = new THREE.Mesh(groundGeo, shader(S.GROUND_VERT, S.GROUND_FRAG, { uParks: { value: parks } }, { depthTest: false, depthWrite: false }))
    ground.renderOrder = -9
    scene.add(ground)

    // ---- buildings ------------------------------------------------------------
    const buildingMat = shader(S.BUILDING_VERT, S.BUILDING_FRAG)
    const boxGeo = keep(new THREE.BoxGeometry(1, 1, 1))
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const col = new THREE.Color()
    for (const casts of [true, false]) {
      const list = city.boxes.filter((b) => b.casts === casts)
      const mesh = new THREE.InstancedMesh(boxGeo, buildingMat, list.length)
      list.forEach((b, i) => {
        m4.compose(pos.set(b.x, b.y + b.h / 2, b.z), q.identity(), scl.set(b.w, b.h, b.d))
        mesh.setMatrixAt(i, m4)
        // data, not colour: tone, kind, glass
        mesh.setColorAt(i, col.setRGB(b.tone, b.kind === 'tower' ? 0 : b.kind === 'podium' ? 0.5 : 1, b.glass ? 1 : 0, THREE.LinearSRGBColorSpace))
      })
      if (casts) mesh.layers.enable(1)
      scene.add(mesh)
      trash.push(mesh)
    }

    // ---- trees ------------------------------------------------------------------
    const treeMat = shader(S.TREE_VERT, S.TREE_FRAG)
    const crownGeo = keep(new THREE.IcosahedronGeometry(1, 1))
    {
      // an irregular crown, the same for every tree (scale varies it)
      const p = crownGeo.getAttribute('position')
      for (let i = 0; i < p.count; i++) {
        const k = 0.86 + 0.28 * Math.abs(Math.sin(p.getX(i) * 12.9 + p.getY(i) * 78.2 + p.getZ(i) * 37.7))
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
      }
      crownGeo.computeVertexNormals()
    }
    const trunkGeo = keep(new THREE.CylinderGeometry(0.2, 0.3, 1, 6))
    trunkGeo.translate(0, 0.5, 0)
    const crowns = new THREE.InstancedMesh(crownGeo, treeMat, city.trees.length)
    const trunks = new THREE.InstancedMesh(trunkGeo, treeMat, city.trees.length)
    city.trees.forEach((t, i) => {
      m4.compose(pos.set(t.x, t.h + t.r * 0.75, t.z), q.identity(), scl.set(t.r, t.r * 1.1, t.r))
      crowns.setMatrixAt(i, m4)
      crowns.setColorAt(i, col.set(CANOPY[Math.floor(t.tone * CANOPY.length) % CANOPY.length]).multiplyScalar(0.62))
      m4.compose(pos.set(t.x, 0, t.z), q.identity(), scl.set(1, t.h + t.r * 0.4, 1))
      trunks.setMatrixAt(i, m4)
      trunks.setColorAt(i, col.set(TRUNK))
    })
    for (const m of [crowns, trunks]) {
      m.layers.enable(1)
      scene.add(m)
      trash.push(m)
    }

    // ---- render the shadow map, once -----------------------------------------
    {
      const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false })
      scene.overrideMaterial = depthOnly
      renderer.setRenderTarget(shadowTarget)
      renderer.clear()
      renderer.render(scene, sunCam)
      renderer.setRenderTarget(null)
      scene.overrideMaterial = null
      depthOnly.dispose()
    }

    // ---- traffic ----------------------------------------------------------------
    const lanes = buildLanes()
    populate(lanes)
    const fleet: Record<VehicleKind, { v: Vehicle; lane: Lane }[]> = { car: [], moto: [], auto: [], bus: [], truck: [] }
    for (const lane of lanes) for (const v of lane.cars) fleet[v.kind].push({ v, lane })
    const vehicleMat = shader(S.VEHICLE_VERT, S.VEHICLE_FRAG)
    const fleetMeshes = KINDS.map((kind) => {
      const geo = keep(vehicleGeometry(kind))
      const brake = new THREE.InstancedBufferAttribute(new Float32Array(fleet[kind].length), 1)
      brake.setUsage(THREE.DynamicDrawUsage)
      geo.setAttribute('aBrake', brake)
      const mesh = new THREE.InstancedMesh(geo, vehicleMat, fleet[kind].length)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      const paints = PAINTS[kind]
      fleet[kind].forEach(({ v }, i) => mesh.setColorAt(i, col.set(paints[Math.floor(v.tone * paints.length) % paints.length])))
      mesh.frustumCulled = false
      scene.add(mesh)
      trash.push(mesh)
      return { kind, mesh, brake }
    })
    const total = KINDS.reduce((n, k) => n + fleet[k].length, 0)
    const blobGeo = keep(new THREE.PlaneGeometry(1, 1))
    blobGeo.rotateX(-Math.PI / 2)
    const blobs = new THREE.InstancedMesh(blobGeo, keep(new THREE.MeshBasicMaterial({ map: keep(blobTexture()), transparent: true, depthWrite: false })), total)
    blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    blobs.frustumCulled = false
    scene.add(blobs)
    trash.push(blobs)

    // ---- the junction's signals ---------------------------------------------------
    const darkMat = keep(new THREE.MeshBasicMaterial({ color: 0x15181d }))
    const poleGeo = keep(new THREE.CylinderGeometry(0.18, 0.22, 7.6, 8))
    const housingGeo = keep(new THREE.BoxGeometry(0.72, 2.1, 0.36))
    const lampGeo = keep(new THREE.SphereGeometry(0.27, 14, 10))
    type Head = { axis: 'ns' | 'ew'; mats: THREE.MeshBasicMaterial[] }
    const heads: Head[] = []
    for (const [x, z, axis] of [
      [-16.5, -16.5, 'ns'],
      [16.5, 16.5, 'ns'],
      [16.5, -16.5, 'ew'],
      [-16.5, 16.5, 'ew'],
    ] as const) {
      const g = new THREE.Group()
      g.position.set(x, 0, z)
      if (axis === 'ew') g.rotation.y = Math.PI / 2
      const pole = new THREE.Mesh(poleGeo, darkMat)
      pole.position.y = 3.8
      const housing = new THREE.Mesh(housingGeo, darkMat)
      housing.position.y = 8.6
      g.add(pole, housing)
      const mats = [0, 1, 2].map(() => keep(new THREE.MeshBasicMaterial({ color: 0x0c0c0c })))
      mats.forEach((m, i) => {
        const lamp = new THREE.Mesh(lampGeo, m)
        lamp.position.y = 9.25 - i * 0.65
        g.add(lamp)
      })
      heads.push({ axis, mats })
      scene.add(g)
    }
    // the eye watching: a faint ring sweeping out from the junction
    const ringGeo = keep(new THREE.RingGeometry(0.985, 1, 160))
    ringGeo.rotateX(-Math.PI / 2)
    const rings = [0, 1].map(() => {
      const r = new THREE.Mesh(ringGeo, keep(new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, depthWrite: false })))
      r.position.y = 0.3
      scene.add(r)
      return r
    })

    // ---- frame ------------------------------------------------------------------
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    const composer = new EffectComposer(renderer, target)
    composer.setPixelRatio(pr)
    composer.addPass(new RenderPass(scene, camera))
    // threshold over a sunlit wall: only the sun, the lamps and glints bloom
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 2.6))
    composer.addPass(new OutputPass())
    let useComposer = true

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      renderer.setSize(w, h)
      composer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)
    const pointer = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    // camera keyframes along the page: [progress, position, look-at]
    const KEYS: [number, THREE.Vector3, THREE.Vector3][] = [
      [0, new THREE.Vector3(0, 240, 730), new THREE.Vector3(0, 10, -200)],
      [0.2, new THREE.Vector3(150, 120, 230), new THREE.Vector3(0, 0, 0)],
      [0.42, new THREE.Vector3(95, 70, 150), new THREE.Vector3(0, 6, 0)],
      [0.62, new THREE.Vector3(-150, 85, 110), new THREE.Vector3(0, 6, 0)],
      [0.8, new THREE.Vector3(-260, 60, -160), new THREE.Vector3(0, 30, 0)],
      [1, new THREE.Vector3(80, 250, 760), new THREE.Vector3(-40, 10, -220)],
    ]
    const camPos = KEYS[0][1].clone()
    const camLook = KEYS[0][2].clone()
    const tgtPos = new THREE.Vector3()
    const tgtLook = new THREE.Vector3()
    const ease = (t: number) => t * t * (3 - 2 * t)
    const sample = (p: number) => {
      let i = 0
      while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++
      const [p0, a0, l0] = KEYS[i]
      const [p1, a1, l1] = KEYS[i + 1]
      const t = ease(Math.min(1, Math.max(0, (p - p0) / (p1 - p0))))
      tgtPos.lerpVectors(a0, a1, t)
      tgtLook.lerpVectors(l0, l1, t)
    }

    // traffic warms up for a minute before the first frame, so queues have formed
    let simT = 0
    for (let i = 0; i < 600; i++) {
      for (const lane of lanes) stepLane(lane, simT, 0.1)
      simT += 0.1
    }

    let raf = 0
    let last = performance.now()
    let running = true
    // Self-protecting quality: measure the first ~2 s; if this machine
    // can't hold ~40 fps, render straight to the screen (no bloom), at 1x
    // pixels, without cloud, and with every other vehicle.
    let probeFrames = 0
    let probeTime = 0
    let light = false
    const onVis = () => {
      running = document.visibilityState === 'visible'
      if (running) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVis)

    const frame = (now: number) => {
      if (!running) return
      const rawDt = (now - last) / 1000
      const dt = Math.min(0.05, rawDt)
      last = now
      if (!light && probeFrames < 120) {
        probeFrames++
        probeTime += rawDt
        if (probeFrames === 120 && probeTime / 120 > 1 / 40) {
          light = true
          useComposer = false
          pr = 1
          renderer.setPixelRatio(pr)
          composer.setPixelRatio(pr)
          resize()
          skyMat.uniforms.uClouds.value = 0
        }
      }
      const simDt = still ? 0 : dt
      simT += simDt
      skyMat.uniforms.uTime.value = simT

      // camera follows the scroll, eased, plus a touch of pointer parallax
      sample(progress.current)
      tgtPos.x += pointer.x * 14
      tgtPos.y += -pointer.y * 8
      camPos.lerp(tgtPos, still ? 1 : Math.min(1, dt * 2.6))
      camLook.lerp(tgtLook, still ? 1 : Math.min(1, dt * 2.6))
      camera.position.copy(camPos)
      camera.lookAt(camLook)
      sky.position.copy(camPos)

      // traffic
      if (simDt > 0) for (const lane of lanes) stepLane(lane, simT, simDt)
      let b = 0
      for (const { kind, mesh, brake } of fleetMeshes) {
        const list = fleet[kind]
        const w = VEHICLES[kind].width
        for (let i = 0; i < list.length; i++) {
          const { v, lane } = list[i]
          const [x, z] = laneXZ(lane, v.u - v.len / 2)
          const hidden = light && i % 2 === 1
          q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, heading(lane))
          m4.compose(pos.set(x, 0, z), q, hidden ? scl.set(0, 0, 0) : scl.set(1, 1, 1))
          mesh.setMatrixAt(i, m4)
          brake.setX(i, v.brake ? 1 : 0)
          m4.compose(pos.set(x, 0.05, z), q, hidden ? scl.set(0, 0, 0) : scl.set(v.len + 0.8, 1, w + 0.7))
          blobs.setMatrixAt(b++, m4)
        }
        mesh.instanceMatrix.needsUpdate = true
        brake.needsUpdate = true
      }
      blobs.instanceMatrix.needsUpdate = true

      // the junction's signals follow the same lights its traffic obeys
      const lights = lightsAt(simT, 0)
      for (const h of heads) {
        const l = h.axis === 'ns' ? lights.ns : lights.ew
        h.mats[0].color.setRGB(l === 'red' ? 5 : 0.05, l === 'red' ? 0.25 : 0.03, l === 'red' ? 0.12 : 0.03)
        h.mats[1].color.setRGB(l === 'amber' ? 5 : 0.05, l === 'amber' ? 2.6 : 0.04, l === 'amber' ? 0.3 : 0.02)
        h.mats[2].color.setRGB(l === 'green' ? 0.4 : 0.02, l === 'green' ? 4.5 : 0.05, l === 'green' ? 1.4 : 0.03)
      }
      rings.forEach((r, i) => {
        const k = ((simT + i * 2.5) % 5) / 5
        const rad = 12 + k * 150
        r.scale.set(rad, 1, rad)
        ;(r.material as THREE.MeshBasicMaterial).opacity = (1 - k) ** 2 * 0.32
      })

      if (useComposer) composer.render(dt)
      else renderer.render(scene, camera)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      running = false
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      trash.forEach((x) => x.dispose())
      target.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [progress, still])

  return <div ref={host} className="fixed inset-0 -z-10 bg-[#a9c3da]" aria-hidden />
}
