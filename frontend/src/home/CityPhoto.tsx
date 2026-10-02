import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import cityNight from '@/assets/city-night.jpg'
import { PHOTO, PHOTO_BEACONS, PHOTO_ROADS } from './cityPhotoData'

/**
 * The home page's background (Section 47): the console's own night
 * photograph (the one behind every console page), brought to life.
 *
 *  - Traffic: headlights and tail-lights drive along the photo's real
 *    roads (traced in cityPhotoData.ts), keeping their distance, queueing
 *    and going again at the signal on the avenue below the flyover.
 *  - Red aviation beacons blink on the tallest towers.
 *  - A camera glides over the photo with the scroll: the whole city, the
 *    interchange, along the flyover, down to the avenue's crossing, the
 *    towers, and back out (`progress` 0..1).
 *  - A little 2.5D depth: nearer ground (lower in the photo) shifts more
 *    than the horizon with the pointer and a slow idle drift.
 *
 * Everything is drawn in photo pixels (y down), so the traffic stays on
 * the roads whatever the zoom. Purely decorative.
 */

/** Camera path along the page: [progress, focus x, focus y, zoom] in photo px. */
const PATH: [number, number, number, number][] = [
  [0, 960, 600, 1],
  [0.16, 440, 700, 1.3],
  [0.34, 660, 860, 1.24],
  [0.52, 880, 860, 1.3],
  [0.72, 1480, 380, 1.22],
  [0.88, 1240, 860, 1.12],
  [1, 960, 600, 1],
]
/** Room kept round the frame for the depth shift, in photo px. */
const MARGIN = 14

const PHOTO_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
/** The photo, displaced by depth: 0 at the horizon, 1 at the bottom edge. */
const PHOTO_FRAG = /* glsl */ `
  uniform sampler2D uPhoto;
  uniform vec2 uShift;
  uniform vec2 uSize;
  varying vec2 vUv;
  void main() {
    float depth = smoothstep(0.06, 1.0, 1.0 - vUv.y);
    vec2 uv = vUv - vec2(uShift.x, -uShift.y) * depth / uSize;
    gl_FragColor = vec4(texture2D(uPhoto, uv).rgb, 1.0);
  }
`

/** One light: a streak with a hot head and a fading tail, additive. */
const CAR_VERT = /* glsl */ `
  attribute vec2 aPos;
  attribute vec2 aDir;
  attribute vec2 aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  uniform vec2 uShift;
  uniform float uHeight;
  varying vec2 vLocal;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vLocal = position.xy + vec2(0.5, 0.0); // x: 0 tail .. 1 head
    vec2 perp = vec2(-aDir.y, aDir.x);
    vec2 p = aPos + aDir * (vLocal.x - 1.0) * aSize.x + perp * position.y * aSize.y;
    p += uShift * smoothstep(0.06, 1.0, aPos.y / uHeight);
    vColor = aColor;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * viewMatrix * vec4(p.x, -p.y, 1.0, 1.0);
  }
`
const CAR_FRAG = /* glsl */ `
  varying vec2 vLocal;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float u = clamp(vLocal.x, 0.0, 1.0);
    float w = vLocal.y * vLocal.y;
    float core = exp(-w * 40.0);
    float halo = exp(-w * 7.0) * 0.4;
    float tail = pow(u, 2.2) * 0.8 * core;
    float head = smoothstep(0.7, 1.0, u) * (1.7 * core + halo);
    float a = (tail + head) * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }
`

const HEAD = new THREE.Color(1, 0.94, 0.82)
const AMBER = new THREE.Color(1, 0.68, 0.25)
const TAIL = new THREE.Color(1, 0.16, 0.1)

/** Perspective: things lower in the photo are nearer, so bigger and faster. */
const near = (y: number) => 0.3 + 0.7 * THREE.MathUtils.smoothstep(y, 80, PHOTO.height)

interface Lane {
  road: string
  pts: Float32Array // x, y pairs
  cum: Float32Array // cumulative length at each point
  length: number
  cars: Car[] // front first
  /** Arc position of a stop line on this lane, or -1. */
  stop: number
  heading: number // -1 away (tail-lights), 1 towards (headlights), 0 across
}
interface Car {
  s: number
  v: number // cruising speed, photo px/s at the nearest point
  len: number
  color: THREE.Color
  seg: number // segment index cache
}

function buildLanes(): Lane[] {
  const lanes: Lane[] = []
  for (const road of PHOTO_ROADS) {
    const P = road.points
    for (const [off, dir] of road.lanes) {
      // offset to the right-hand side of the line's direction
      const raw: [number, number][] = P.map((p, i) => {
        const a = P[Math.max(0, i - 1)]
        const b = P[Math.min(P.length - 1, i + 1)]
        const tx = b[0] - a[0]
        const ty = b[1] - a[1]
        const l = Math.hypot(tx, ty) || 1
        return [p[0] + (-ty / l) * off, p[1] + (tx / l) * off]
      })
      if (dir === -1) raw.reverse()
      const pts = new Float32Array(raw.flat())
      const cum = new Float32Array(raw.length)
      for (let i = 1; i < raw.length; i++) cum[i] = cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1])
      const length = cum[cum.length - 1]
      const dy = (raw[raw.length - 1][1] - raw[0][1]) / (length || 1)
      lanes.push({ road: road.name, pts, cum, length, cars: [], stop: -1, heading: dy > 0.18 ? 1 : dy < -0.18 ? -1 : 0 })
    }
  }
  return lanes
}

/** Point and unit direction at arc position s on a lane (seg is a cache, returned updated). */
function at(lane: Lane, s: number, seg: number, out: { x: number; y: number; dx: number; dy: number; seg: number }) {
  const { cum, pts } = lane
  let i = Math.min(Math.max(seg, 0), cum.length - 2)
  while (i > 0 && cum[i] > s) i--
  while (i < cum.length - 2 && cum[i + 1] < s) i++
  const l = cum[i + 1] - cum[i] || 1
  const t = Math.min(1, Math.max(0, (s - cum[i]) / l))
  const x0 = pts[i * 2]
  const y0 = pts[i * 2 + 1]
  const x1 = pts[i * 2 + 2]
  const y1 = pts[i * 2 + 3]
  out.x = x0 + (x1 - x0) * t
  out.y = y0 + (y1 - y0) * t
  out.dx = (x1 - x0) / l
  out.dy = (y1 - y0) / l
  out.seg = i
}

export function CityPhoto({ progress, still }: { progress: MutableRefObject<number>; still: boolean }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      // transparent until the photo texture is in: the CSS copy underneath shows meanwhile
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      return // no WebGL: the CSS photo behind stays
    }
    let pr = Math.min(1.5, window.devicePixelRatio || 1)
    renderer.setPixelRatio(pr)
    renderer.setClearColor(0x07101f, 0)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10)
    const trash: { dispose(): void }[] = []
    const keep = <T extends { dispose(): void }>(x: T) => (trash.push(x), x)
    const shift = new THREE.Vector2()

    // ---- the photo -----------------------------------------------------------
    const tex = keep(
      new THREE.TextureLoader().load(cityNight, () => {
        photo.visible = true
      }),
    )
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    const photo = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(PHOTO.width, PHOTO.height)),
      keep(
        new THREE.ShaderMaterial({
          vertexShader: PHOTO_VERT,
          fragmentShader: PHOTO_FRAG,
          uniforms: { uPhoto: { value: tex }, uShift: { value: shift }, uSize: { value: new THREE.Vector2(PHOTO.width, PHOTO.height) } },
          depthTest: false,
          depthWrite: false,
        }),
      ),
    )
    photo.position.set(PHOTO.width / 2, -PHOTO.height / 2, 0)
    photo.visible = false
    scene.add(photo)

    // ---- traffic ---------------------------------------------------------------
    const lanes = buildLanes()
    // The avenue's signal: southbound stops north of the zebra, northbound south of it.
    const STOP_Y = { south: 1098, north: 1140 }
    for (const lane of lanes) {
      // spacing: a car every ~70 px near, closer far away (they're smaller there)
      const spacing = 36 + 44 * near(lane.pts[1])
      const n = Math.max(2, Math.floor(lane.length / spacing))
      for (let i = 0; i < n; i++) {
        const s = lane.length * (1 - (i + Math.random() * 0.6) / n)
        const color = lane.heading > 0 ? (Math.random() < 0.15 ? AMBER : HEAD) : lane.heading < 0 ? TAIL : Math.random() < 0.5 ? HEAD : TAIL
        lane.cars.push({ s, v: 62 + Math.random() * 34, len: 14 + Math.random() * 12, color, seg: 0 })
      }
      lane.cars.sort((a, b) => b.s - a.s)
    }
    for (const lane of lanes.filter((l) => l.road === 'avenue_low')) {
      // find the arc position of this lane's stop line
      const target = lane.heading > 0 ? STOP_Y.south : STOP_Y.north
      for (let i = 0; i < lane.cum.length - 1; i++) {
        const y0 = lane.pts[i * 2 + 1]
        const y1 = lane.pts[i * 2 + 3]
        if ((y0 - target) * (y1 - target) <= 0) {
          lane.stop = lane.cum[i] + ((target - y0) / (y1 - y0 || 1)) * (lane.cum[i + 1] - lane.cum[i])
          break
        }
      }
    }
    const total = lanes.reduce((n, l) => n + l.cars.length, 0)

    const quad = keep(new THREE.PlaneGeometry(1, 1))
    const geo = keep(new THREE.InstancedBufferGeometry())
    geo.index = quad.index
    geo.setAttribute('position', quad.getAttribute('position'))
    const aPos = new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2)
    const aDir = new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2)
    const aSize = new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2)
    const aColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3)
    const aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(total), 1)
    for (const a of [aPos, aDir, aSize, aAlpha]) a.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aPos', aPos)
    geo.setAttribute('aDir', aDir)
    geo.setAttribute('aSize', aSize)
    geo.setAttribute('aColor', aColor)
    geo.setAttribute('aAlpha', aAlpha)
    geo.instanceCount = total
    {
      let k = 0
      for (const lane of lanes) for (const car of lane.cars) car.color.toArray(aColor.array, k++ * 3)
    }
    const carMat = keep(
      new THREE.ShaderMaterial({
        vertexShader: CAR_VERT,
        fragmentShader: CAR_FRAG,
        uniforms: { uShift: { value: shift }, uHeight: { value: PHOTO.height } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // photo y runs down, so the quads' winding flips on the way to the
        // screen: draw both faces
        side: THREE.DoubleSide,
      }),
    )
    const cars = new THREE.Mesh(geo, carMat)
    cars.frustumCulled = false
    scene.add(cars)

    // ---- beacons -------------------------------------------------------------
    const dot = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 32
      const g = c.getContext('2d')
      if (g) {
        const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
        grad.addColorStop(0, 'rgba(255,255,255,1)')
        grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = grad
        g.fillRect(0, 0, 32, 32)
      }
      return keep(new THREE.CanvasTexture(c))
    })()
    const beaconGeo = keep(new THREE.BufferGeometry())
    beaconGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PHOTO_BEACONS.flatMap(([x, y]) => [x, -y, 2])), 3))
    const beaconMat = keep(
      new THREE.PointsMaterial({ color: 0xff2a1a, map: dot, size: 9, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    scene.add(new THREE.Points(beaconGeo, beaconMat))

    // the avenue crossing's signal heads, seen from above: one each side
    const lampGeo = keep(new THREE.BufferGeometry())
    lampGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([828, -1094, 2, 906, -1144, 2]), 3))
    const lampMat = keep(
      new THREE.PointsMaterial({ color: 0x34e27c, map: dot, size: 7, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    scene.add(new THREE.Points(lampGeo, lampMat))

    // ---- framing -------------------------------------------------------------
    let W = 1
    let H = 1
    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      renderer.setSize(W, H)
    }
    resize()
    window.addEventListener('resize', resize)
    const pointer = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    const ease = (t: number) => t * t * (3 - 2 * t)
    const target = { x: PATH[0][1], y: PATH[0][2], z: PATH[0][3] }
    const view = { ...target }
    const sample = (p: number) => {
      let i = 0
      while (i < PATH.length - 2 && p > PATH[i + 1][0]) i++
      const a = PATH[i]
      const b = PATH[i + 1]
      const t = ease(Math.min(1, Math.max(0, (p - a[0]) / (b[0] - a[0]))))
      target.x = a[1] + (b[1] - a[1]) * t
      target.y = a[2] + (b[2] - a[2]) * t
      target.z = a[3] + (b[3] - a[3]) * t
    }
    const frameCamera = () => {
      // cover the viewport with the photo (less a margin for the depth shift), then zoom
      const scale = Math.max(W / (PHOTO.width - 2 * MARGIN), H / (PHOTO.height - 2 * MARGIN)) * view.z
      const vw = W / scale
      const vh = H / scale
      const cx = Math.min(PHOTO.width - MARGIN - vw / 2, Math.max(MARGIN + vw / 2, view.x))
      const cy = Math.min(PHOTO.height - MARGIN - vh / 2, Math.max(MARGIN + vh / 2, view.y))
      camera.left = cx - vw / 2
      camera.right = cx + vw / 2
      camera.top = -(cy - vh / 2)
      camera.bottom = -(cy + vh / 2)
      camera.updateProjectionMatrix()
    }

    // ---- the loop --------------------------------------------------------------
    const pos = { x: 0, y: 0, dx: 0, dy: 0, seg: 0 }
    let raf = 0
    let last = performance.now()
    let running = true
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
      const t = now / 1000
      // a slow machine gets 1x pixels and every other car
      if (!light && probeFrames < 120) {
        probeFrames++
        probeTime += rawDt
        if (probeFrames === 120 && probeTime / 120 > 1 / 40) {
          light = true
          pr = 1
          renderer.setPixelRatio(pr)
          resize()
        }
      }

      // camera: the scroll path, eased, with a slow idle drift and the pointer
      sample(still ? 0 : progress.current)
      const drift = still ? 0 : 1
      const k = still ? 1 : Math.min(1, dt * 2.4)
      view.x += (target.x + (Math.sin(t * 0.13) * 8 + pointer.x * 12) * drift - view.x) * k
      view.y += (target.y + (Math.cos(t * 0.11) * 5 + pointer.y * 8) * drift - view.y) * k
      view.z += (target.z - view.z) * k
      frameCamera()
      shift.set((pointer.x * 7 + Math.sin(t * 0.17) * 3) * drift, (pointer.y * 4 + Math.cos(t * 0.15) * 2) * drift)

      // the avenue's signal: 16 s green, 3 s amber, 11 s red
      const cyc = t % 30
      const red = cyc >= 19
      const amber = cyc >= 16 && cyc < 19

      let idx = 0
      const flow = still ? 0 : dt
      for (const lane of lanes) {
        const cs = lane.cars
        for (let c = 0; c < cs.length; c++) {
          const car = cs[c]
          at(lane, car.s, car.seg, pos)
          car.seg = pos.seg
          const n = near(pos.y)
          // keep a gap to the car ahead (the lane is a loop: the front car follows the last)
          let ahead = c === 0 ? cs[cs.length - 1].s : cs[c - 1].s
          if (ahead <= car.s) ahead += lane.length
          let limit = ahead - (car.len * n + 10 * n)
          // stop at the line on red (and on amber, if there's room to)
          if (lane.stop > 0 && (red || amber) && car.s < lane.stop) limit = Math.min(limit, lane.stop - 2)
          const step = car.v * n * flow
          car.s = Math.max(car.s, Math.min(car.s + step, limit))
          if (car.s >= lane.length) car.s -= lane.length
          // fade in and out at the ends of the lane (behind buildings, off the photo)
          const edge = Math.min(car.s, lane.length - car.s)
          const fade = Math.min(1, Math.max(0, edge / 28))
          aPos.setXY(idx, pos.x, pos.y)
          aDir.setXY(idx, pos.dx, pos.dy)
          aSize.setXY(idx, car.len * n, 6.5 * n + 1.5)
          aAlpha.setX(idx, light && idx % 2 ? 0 : fade * (0.65 + 0.35 * n))
          idx++
        }
        // keep the lane's cars front-first after any wrap
        if (cs.length > 1 && cs[0].s < cs[cs.length - 1].s) cs.push(cs.shift() as Car)
      }
      aPos.needsUpdate = aDir.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = true

      lampMat.color.set(red ? 0xff2a1a : amber ? 0xffb020 : 0x34e27c)
      // aviation beacons: a short flash every 1.5 s, all together
      beaconMat.opacity = (t % 1.5) < 0.35 ? 1 : 0.12

      renderer.render(scene, camera)
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
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [progress, still])

  // the photo as a plain CSS background underneath, for the moment before
  // WebGL draws (and for a machine without it)
  return <div ref={host} className="fixed inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url(${cityNight})` }} aria-hidden />
}
