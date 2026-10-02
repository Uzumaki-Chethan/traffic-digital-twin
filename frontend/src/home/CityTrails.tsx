import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const FOG = new THREE.Color(0x05070e)
const FOG_DENSITY = 0.0036

/**
 * Towers whose windows are drawn per floor in world metres (so a 140 m
 * tower has 40 floors of normal-sized windows, not 16 giant ones), lit at
 * random, warm or cool, a few flickering; side faces a shade darker, a
 * warm spill of street light at their feet.
 */
const BUILDING_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vSeed;
  varying float vTop;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vN = normal;
    vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
    vTop = length(instanceMatrix[1].xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const BUILDING_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uFog;
  uniform float uFogDensity;
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vSeed;
  varying float vTop;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 col;
    if (vN.y > 0.5) {
      col = vec3(0.016, 0.02, 0.032);
    } else {
      float side = abs(vN.x) > 0.5 ? 0.7 : 1.0;
      col = vec3(0.022, 0.03, 0.052) * side;
      float u = abs(vN.x) > 0.5 ? vWorld.z : vWorld.x;
      float h = vWorld.y;
      vec2 cell = vec2(floor(u / 3.0), floor(h / 3.5));
      vec2 f = vec2(fract(u / 3.0), fract(h / 3.5));
      // soft-edged window, a little narrower than its bay
      float win = smoothstep(0.18, 0.26, f.x) * smoothstep(0.82, 0.74, f.x)
                * smoothstep(0.24, 0.32, f.y) * smoothstep(0.84, 0.76, f.y);
      vec2 key = cell + vec2(vSeed * 97.0, vN.x * 13.0 + vN.z * 29.0);
      float r = hash(key);
      // whole floors go dark together sometimes: offices after hours
      float floorOn = step(0.22, hash(vec2(cell.y, vSeed * 41.0)));
      float lit = step(0.58, r) * floorOn;
      float warm = step(0.3, hash(key * 1.7));
      vec3 wc = mix(vec3(0.5, 0.72, 1.25), vec3(1.5, 0.98, 0.52), warm);
      float flick = 1.0 - 0.6 * step(0.985, r) * step(0.5, fract(uTime * 0.7 + r * 9.0));
      col += win * lit * wc * (0.3 + 0.7 * hash(key + 3.1)) * flick;
      // street light washing up the lowest floors
      col += vec3(0.32, 0.17, 0.06) * exp(-h * 0.22);
      // a thin lit cornice on the tall ones
      col += vec3(0.9, 0.55, 0.25) * step(vTop - 0.6, h) * step(60.0, vTop) * 0.8;
    }
    float d = length(vWorld - cameraPosition);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
    gl_FragColor = vec4(mix(col, uFog, clamp(fog, 0.0, 1.0)), 1.0);
  }
`

/** Night sky: deep blue overhead, an amber city haze along the horizon. */
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const SKY_FRAG = /* glsl */ `
  uniform vec3 uFog;
  varying vec3 vDir;
  void main() {
    float y = vDir.y;
    vec3 top = vec3(0.012, 0.018, 0.045);
    vec3 haze = vec3(0.30, 0.12, 0.05);
    vec3 col = mix(top, uFog, smoothstep(0.55, 0.0, y));
    col += haze * exp(-abs(y) * 9.0) * 0.8;
    gl_FragColor = vec4(col, 1.0);
  }
`

/** A light trail's texture: dark at the tail, brightening to a hot head. */
function trailTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 16
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createLinearGradient(0, 0, 256, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.7, 'rgba(255,255,255,0.45)')
    grad.addColorStop(0.94, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 16)
    // fade the edges across the width so a trail has no hard sides
    const across = g.createLinearGradient(0, 0, 0, 16)
    across.addColorStop(0, 'rgba(0,0,0,1)')
    across.addColorStop(0.5, 'rgba(0,0,0,0)')
    across.addColorStop(1, 'rgba(0,0,0,1)')
    g.globalCompositeOperation = 'destination-out'
    g.fillStyle = across
    g.fillRect(0, 0, 256, 16)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * The home page's background (Section 44): a night city seen like a
 * long-exposure photograph — streams of red tail-lights and white/amber
 * headlights flowing along the roads into a junction whose signals
 * change, with a scanning ring sweeping out from it (the "eye" watching),
 * rooftop beacons, sparks drifting up, a soft bloom over everything. The
 * camera flies with the page: high above the city at the top, down to the
 * junction through the middle, back up at the end (`progress` 0..1). The
 * pointer adds a little parallax. Purely decorative.
 */
export function CityTrails({ progress, still }: { progress: MutableRefObject<number>; still: boolean }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    } catch {
      return // no WebGL: the CSS gradient behind stays
    }
    const pr = Math.min(1.75, window.devicePixelRatio || 1)
    renderer.setPixelRatio(pr)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.setClearColor(FOG, 1)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(FOG, FOG_DENSITY)
    const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 3000)

    const trash: { dispose(): void }[] = []
    const keep = <T extends { dispose(): void }>(x: T) => (trash.push(x), x)

    // ---- sky and stars -----------------------------------------------------
    const sky = new THREE.Mesh(
      keep(new THREE.SphereGeometry(1600, 32, 16)),
      keep(new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uFog: { value: FOG } }, side: THREE.BackSide, depthWrite: false, fog: false })),
    )
    scene.add(sky)
    const STARS = 700
    const starPos = new Float32Array(STARS * 3)
    for (let i = 0; i < STARS; i++) {
      const th = Math.random() * Math.PI * 2
      const y = 0.15 + Math.random() * 0.85
      const r = Math.sqrt(1 - y * y)
      starPos.set([Math.cos(th) * r * 1400, y * 1400, Math.sin(th) * r * 1400], i * 3)
    }
    const starGeo = keep(new THREE.BufferGeometry())
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const stars = new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: 0x9fb4ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false, depthWrite: false })))
    scene.add(stars)

    // ---- ground and roads -------------------------------------------------
    const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(3000, 3000)), keep(new THREE.MeshBasicMaterial({ color: 0x060912 })))
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)
    const grid = new THREE.GridHelper(2400, 120, 0x1a2236, 0x0d1220)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.4
    grid.position.y = 0.05
    scene.add(grid)

    // Roads every 120 m both ways; the junction sits on the two at 0.
    const ROADS = [-480, -360, -240, -120, 0, 120, 240, 360, 480]
    const roadMat = keep(new THREE.MeshBasicMaterial({ color: 0x0b101b }))
    const edgeMat = keep(new THREE.MeshBasicMaterial({ color: 0x33456c, transparent: true, opacity: 0.55 }))
    const dashMat = keep(new THREE.MeshBasicMaterial({ color: 0x8a6a2a, transparent: true, opacity: 0.45 }))
    for (const c of ROADS) {
      const w = c === 0 ? 22 : 12
      for (const axis of ['x', 'z'] as const) {
        const road = new THREE.Mesh(keep(new THREE.PlaneGeometry(axis === 'x' ? 1200 : w, axis === 'x' ? w : 1200)), roadMat)
        road.rotation.x = -Math.PI / 2
        road.position.set(axis === 'x' ? 0 : c, 0.1, axis === 'x' ? c : 0)
        scene.add(road)
        for (const side of [-1, 1]) {
          const edge = new THREE.Mesh(keep(new THREE.PlaneGeometry(axis === 'x' ? 1200 : 0.4, axis === 'x' ? 0.4 : 1200)), edgeMat)
          edge.rotation.x = -Math.PI / 2
          edge.position.set(axis === 'x' ? 0 : c + (side * w) / 2, 0.15, axis === 'x' ? c + (side * w) / 2 : 0)
          scene.add(edge)
        }
        // a faint amber centre line
        const centre = new THREE.Mesh(keep(new THREE.PlaneGeometry(axis === 'x' ? 1200 : 0.3, axis === 'x' ? 0.3 : 1200)), dashMat)
        centre.rotation.x = -Math.PI / 2
        centre.position.set(axis === 'x' ? 0 : c, 0.16, axis === 'x' ? c : 0)
        scene.add(centre)
      }
    }

    // ---- buildings ----------------------------------------------------------
    const buildingMat = keep(
      new THREE.ShaderMaterial({
        vertexShader: BUILDING_VERT,
        fragmentShader: BUILDING_FRAG,
        uniforms: { uTime: { value: 0 }, uFog: { value: FOG }, uFogDensity: { value: FOG_DENSITY } },
      }),
    )
    const boxGeo = keep(new THREE.BoxGeometry(1, 1, 1))
    const blocks: THREE.Matrix4[] = []
    const beacons: number[] = []
    const m4 = new THREE.Matrix4()
    for (let i = 0; i < ROADS.length - 1; i++) {
      for (let j = 0; j < ROADS.length - 1; j++) {
        const x0 = ROADS[i] + 10
        const z0 = ROADS[j] + 10
        // the four blocks round the junction stay low so it stays in view
        const near = Math.abs(ROADS[i] + 60) < 70 && Math.abs(ROADS[j] + 60) < 70
        const dist = Math.hypot(ROADS[i] + 60, ROADS[j] + 60)
        for (let k = 0; k < 6; k++) {
          const w = 14 + Math.random() * 26
          const d = 14 + Math.random() * 26
          const tall = near ? 50 : 60 + Math.min(1, dist / 400) * 150
          const h = (near ? 12 : 18) + Math.random() ** 2.2 * tall
          const x = x0 + Math.random() * (100 - w) + w / 2
          const z = z0 + Math.random() * (100 - d) + d / 2
          m4.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d))
          blocks.push(m4.clone())
          if (h > 90) beacons.push(x, h + 1.5, z)
        }
      }
    }
    const buildings = new THREE.InstancedMesh(boxGeo, buildingMat, blocks.length)
    blocks.forEach((b, i) => buildings.setMatrixAt(i, b))
    scene.add(buildings)
    // red aviation beacons on the tall towers, blinking slowly together
    const beaconGeo = keep(new THREE.BufferGeometry())
    beaconGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(beacons), 3))
    // a fixed few pixels across whatever the distance, and round
    const dotTex = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 32
      const g = c.getContext('2d')
      if (g) {
        const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
        grad.addColorStop(0, 'rgba(255,255,255,1)')
        grad.addColorStop(0.4, 'rgba(255,255,255,0.6)')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = grad
        g.fillRect(0, 0, 32, 32)
      }
      return keep(new THREE.CanvasTexture(c))
    })()
    const beaconMat = keep(new THREE.PointsMaterial({ color: new THREE.Color(4, 0.3, 0.2), map: dotTex, size: 7, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false }))
    scene.add(new THREE.Points(beaconGeo, beaconMat))

    // ---- light trails ------------------------------------------------------
    // Each trail drives one lane: right-hand traffic, red tail-lights going
    // away, warm-white headlights coming towards. Two crossed planes with a
    // tail-to-head fade, so they read as streaks from above and from low.
    type Lane = { axis: 'x' | 'z'; c: number; off: number; dir: 1 | -1 }
    const lanes: Lane[] = []
    for (const c of ROADS) {
      const lanesEach = c === 0 ? [3, 7] : [2.5]
      for (const off of lanesEach) {
        lanes.push({ axis: 'x', c, off, dir: 1 }, { axis: 'x', c, off: -off, dir: -1 }, { axis: 'z', c, off, dir: -1 }, { axis: 'z', c, off: -off, dir: 1 })
      }
    }
    const STREAKS = 1100
    const flat = new THREE.PlaneGeometry(1, 2.6)
    flat.rotateX(-Math.PI / 2)
    const upright = new THREE.PlaneGeometry(1, 1.2)
    const streakGeo = keep(mergeGeometries([flat, upright]))
    flat.dispose()
    upright.dispose()
    const streakMat = keep(
      new THREE.MeshBasicMaterial({ map: keep(trailTexture()), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    )
    const streaks = new THREE.InstancedMesh(streakGeo, streakMat, STREAKS)
    const sState = Array.from({ length: STREAKS }, () => {
      const lane = lanes[Math.floor(Math.random() * lanes.length)]
      return { lane, s: Math.random() * 1200 - 600, v: 22 + Math.random() * 40, len: 16 + Math.random() * 34 }
    })
    const RED = new THREE.Color(4.2, 0.3, 0.2)
    const WHITE = new THREE.Color(3.2, 2.9, 2.4)
    const AMBER = new THREE.Color(3.2, 1.45, 0.3)
    const col = new THREE.Color()
    sState.forEach((st, i) => {
      const away = st.lane.dir === 1
      col.copy(away ? RED : Math.random() < 0.18 ? AMBER : WHITE)
      streaks.setColorAt(i, col)
    })
    scene.add(streaks)
    const q = new THREE.Quaternion()
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()

    // ---- the junction's signals --------------------------------------------
    const lampGeo = keep(new THREE.SphereGeometry(1.6, 16, 12))
    const poleMat = keep(new THREE.MeshBasicMaterial({ color: 0x1a1f2b }))
    type Head = { mats: THREE.MeshBasicMaterial[]; axis: 'ns' | 'ew' }
    const heads: Head[] = []
    for (const [x, z, axis] of [
      [-16, -16, 'ns'],
      [16, 16, 'ns'],
      [16, -16, 'ew'],
      [-16, 16, 'ew'],
    ] as const) {
      const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.5, 0.5, 14, 8)), poleMat)
      pole.position.set(x, 7, z)
      scene.add(pole)
      const mats = [0, 1, 2].map(() => keep(new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false })))
      mats.forEach((m, i) => {
        const lamp = new THREE.Mesh(lampGeo, m)
        lamp.position.set(x, 18 - i * 3.6, z)
        scene.add(lamp)
      })
      heads.push({ mats, axis })
    }
    // a glow pool on the junction itself
    const pool = new THREE.Mesh(
      keep(new THREE.CircleGeometry(60, 64)),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.22, 0.08), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })),
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.y = 0.2
    scene.add(pool)
    // the eye watching: rings sweeping out from the junction
    const ringGeo = keep(new THREE.RingGeometry(0.97, 1, 128))
    ringGeo.rotateX(-Math.PI / 2)
    const rings = [0, 1, 2].map(() => {
      const m = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
      const r = new THREE.Mesh(ringGeo, m)
      r.position.y = 0.4
      scene.add(r)
      return r
    })

    // ---- sparks drifting up ------------------------------------------------
    const SPARKS = 500
    const sparkGeo = keep(new THREE.BufferGeometry())
    const sparkPos = new Float32Array(SPARKS * 3)
    const sparkSeed = Array.from({ length: SPARKS }, () => [Math.random() * 900 - 450, Math.random() * 900 - 450, Math.random() * 200, 2 + Math.random() * 6])
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
    const sparks = new THREE.Points(sparkGeo, keep(new THREE.PointsMaterial({ color: new THREE.Color(1.6, 0.9, 0.5), map: dotTex, size: 2.2, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })))
    scene.add(sparks)

    // ---- bloom -------------------------------------------------------------
    const composer = new EffectComposer(renderer)
    composer.setPixelRatio(pr)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.95, 0.5, 0.6)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

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
      [0, new THREE.Vector3(0, 300, 430), new THREE.Vector3(0, 20, 0)],
      [0.2, new THREE.Vector3(150, 120, 230), new THREE.Vector3(0, 0, 0)],
      [0.42, new THREE.Vector3(95, 70, 150), new THREE.Vector3(0, 6, 0)],
      [0.62, new THREE.Vector3(-150, 85, 110), new THREE.Vector3(0, 6, 0)],
      [0.8, new THREE.Vector3(-260, 60, -160), new THREE.Vector3(0, 30, 0)],
      [1, new THREE.Vector3(0, 420, 520), new THREE.Vector3(0, 0, 0)],
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

    let raf = 0
    let last = performance.now()
    let running = true
    // Self-protecting quality: measure the first ~2 s; if this machine
    // can't hold ~40 fps, drop to 1x pixels, fewer trails, no stars.
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
      if (!light && probeFrames < 120) {
        probeFrames++
        probeTime += rawDt
        if (probeFrames === 120 && probeTime / 120 > 1 / 40) {
          light = true
          renderer.setPixelRatio(1)
          composer.setPixelRatio(1)
          resize()
          streaks.count = Math.round(STREAKS / 2)
          stars.visible = false
        }
      }
      // camera follows the scroll, eased, plus a touch of pointer parallax
      sample(progress.current)
      tgtPos.x += pointer.x * 14
      tgtPos.y += -pointer.y * 8
      camPos.lerp(tgtPos, still ? 1 : Math.min(1, dt * 2.6))
      camLook.lerp(tgtLook, still ? 1 : Math.min(1, dt * 2.6))
      camera.position.copy(camPos)
      camera.lookAt(camLook)
      sky.position.copy(camPos)
      stars.position.copy(camPos)
      buildingMat.uniforms.uTime.value = t

      // trails glide; they wrap at the city's edge
      const flow = still ? 0 : dt
      for (let i = 0; i < streaks.count; i++) {
        const st = sState[i]
        st.s += st.v * flow * st.lane.dir
        if (st.s > 600) st.s -= 1200
        if (st.s < -600) st.s += 1200
        const { lane } = st
        // the texture's head is at +x: point it the way the car travels
        if (lane.axis === 'x') {
          pos.set(st.s - (lane.dir * st.len) / 2, 0.75, lane.c + lane.off)
          q.identity()
          scl.set(st.len * lane.dir, 1, 1)
        } else {
          pos.set(lane.c + lane.off, 0.75, st.s - (lane.dir * st.len) / 2)
          q.copy(qz)
          scl.set(-st.len * lane.dir, 1, 1)
        }
        m4.compose(pos, q, scl)
        streaks.setMatrixAt(i, m4)
      }
      streaks.instanceMatrix.needsUpdate = true

      // signals: N–S green 7 s, amber 2 s, then E–W, round and round
      const cyc = t % 18
      const nsGreen = cyc < 7
      const nsAmber = cyc >= 7 && cyc < 9
      const ewGreen = cyc >= 9 && cyc < 16
      const ewAmber = cyc >= 16
      for (const h of heads) {
        const g = h.axis === 'ns' ? nsGreen : ewGreen
        const a = h.axis === 'ns' ? nsAmber : ewAmber
        h.mats[0].color.setRGB(g || a ? 0.08 : 3.2, g || a ? 0.02 : 0.15, 0.1)
        h.mats[1].color.setRGB(a ? 3.0 : 0.08, a ? 1.6 : 0.06, a ? 0.2 : 0.02)
        h.mats[2].color.setRGB(g ? 0.3 : 0.02, g ? 3.0 : 0.08, g ? 1.0 : 0.04)
      }
      // scan rings: each sweeps out to 160 m over 4.5 s, fading as it goes
      rings.forEach((r, i) => {
        const k = ((t + i * 1.5) % 4.5) / 4.5
        const rad = 8 + k * 160
        r.scale.set(rad, 1, rad)
        ;(r.material as THREE.MeshBasicMaterial).opacity = (1 - k) ** 2 * 0.55
      })
      beaconMat.opacity = 0.25 + 0.75 * (Math.sin(t * 2.2) > 0.6 ? 1 : 0)

      for (let i = 0; i < SPARKS; i++) {
        const [x, z, off, sp] = sparkSeed[i]
        sparkPos[i * 3] = x
        sparkPos[i * 3 + 1] = (off + t * sp) % 200
        sparkPos[i * 3 + 2] = z
      }
      sparkGeo.getAttribute('position').needsUpdate = true

      composer.render(dt)
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
      grid.geometry.dispose()
      ;(grid.material as THREE.Material).dispose()
      streaks.dispose()
      buildings.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [progress, still])

  return <div ref={host} className="fixed inset-0 -z-10 bg-[#05070e]" aria-hidden />
}
