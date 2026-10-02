import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

/**
 * The home page's background (Section 44): a night city seen like a
 * long-exposure photograph — streams of red tail-lights and white/amber
 * headlights flowing along glowing roads into a junction whose signals
 * change, sparks drifting up, a soft bloom over everything. The camera
 * flies with the page: high above the city at the top, down to the
 * junction through the middle, back up at the end (`progress` 0..1).
 * The pointer adds a little parallax. Purely decorative.
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
    renderer.setClearColor(0x04060c, 1)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x04060c, 0.0042)
    const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2000)

    const trash: { dispose(): void }[] = []
    const keep = <T extends { dispose(): void }>(x: T) => (trash.push(x), x)

    // ---- ground and roads -------------------------------------------------
    const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(2400, 2400)), keep(new THREE.MeshBasicMaterial({ color: 0x070a12 })))
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)
    const grid = new THREE.GridHelper(2400, 120, 0x1a2236, 0x0d1220)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.55
    grid.position.y = 0.05
    scene.add(grid)

    // Roads every 120 m both ways; the junction sits on the two at 0.
    const ROADS = [-480, -360, -240, -120, 0, 120, 240, 360, 480]
    const roadMat = keep(new THREE.MeshBasicMaterial({ color: 0x0c111d }))
    const edgeMat = keep(new THREE.MeshBasicMaterial({ color: 0x2b3a5c, transparent: true, opacity: 0.6 }))
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
      }
    }

    // ---- buildings: dark blocks with lit windows ---------------------------
    const winTex = (() => {
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 128
      const g = c.getContext('2d')
      if (g) {
        g.fillStyle = '#0a0e18'
        g.fillRect(0, 0, 64, 128)
        for (let y = 4; y < 128; y += 8) {
          for (let x = 4; x < 64; x += 8) {
            if (Math.random() < 0.38) {
              g.fillStyle = Math.random() < 0.8 ? '#ffd9a0' : '#9fc6ff'
              g.globalAlpha = 0.35 + Math.random() * 0.65
              g.fillRect(x, y, 4, 4)
            }
          }
        }
      }
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      return keep(t)
    })()
    const buildingMat = keep(new THREE.MeshBasicMaterial({ map: winTex, color: 0xb8c2d8 }))
    const boxGeo = keep(new THREE.BoxGeometry(1, 1, 1))
    const blocks: THREE.Matrix4[] = []
    const m4 = new THREE.Matrix4()
    for (let i = 0; i < ROADS.length - 1; i++) {
      for (let j = 0; j < ROADS.length - 1; j++) {
        const x0 = ROADS[i] + 10
        const z0 = ROADS[j] + 10
        const near = Math.abs(ROADS[i] + 60) < 70 && Math.abs(ROADS[j] + 60) < 70
        for (let k = 0; k < 6; k++) {
          const w = 14 + Math.random() * 26
          const d = 14 + Math.random() * 26
          const h = (near ? 12 : 20) + Math.random() ** 2 * (near ? 50 : 140)
          const x = x0 + Math.random() * (100 - w) + w / 2
          const z = z0 + Math.random() * (100 - d) + d / 2
          m4.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d))
          blocks.push(m4.clone())
        }
      }
    }
    const buildings = new THREE.InstancedMesh(boxGeo, buildingMat, blocks.length)
    blocks.forEach((b, i) => buildings.setMatrixAt(i, b))
    scene.add(buildings)

    // ---- light trails: streaks gliding along every lane --------------------
    // Each streak drives one lane of one road: right-hand traffic, red
    // tail-lights going away, warm-white headlights coming towards.
    type Lane = { axis: 'x' | 'z'; c: number; off: number; dir: 1 | -1 }
    const lanes: Lane[] = []
    for (const c of ROADS) {
      const lanesEach = c === 0 ? [3, 7] : [2.5]
      for (const off of lanesEach) {
        lanes.push({ axis: 'x', c, off, dir: 1 }, { axis: 'x', c, off: -off, dir: -1 }, { axis: 'z', c, off, dir: -1 }, { axis: 'z', c, off: -off, dir: 1 })
      }
    }
    const STREAKS = 900
    const streakGeo = keep(new THREE.BoxGeometry(1, 1.3, 2.4))
    const streakMat = keep(new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: false }))
    const streaks = new THREE.InstancedMesh(streakGeo, streakMat, STREAKS)
    const sState = Array.from({ length: STREAKS }, () => {
      const lane = lanes[Math.floor(Math.random() * lanes.length)]
      return { lane, s: Math.random() * 1200 - 600, v: 22 + Math.random() * 40, len: 14 + Math.random() * 26 }
    })
    const RED = new THREE.Color(3.2, 0.25, 0.2)
    const WHITE = new THREE.Color(2.6, 2.3, 1.9)
    const AMBER = new THREE.Color(3.0, 1.5, 0.35)
    const col = new THREE.Color()
    sState.forEach((st, i) => {
      // the camera mostly looks along +z/-x, so colour by direction of travel
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

    // ---- sparks drifting up ------------------------------------------------
    const SPARKS = 500
    const sparkGeo = keep(new THREE.BufferGeometry())
    const sparkPos = new Float32Array(SPARKS * 3)
    const sparkSeed = Array.from({ length: SPARKS }, () => [Math.random() * 900 - 450, Math.random() * 900 - 450, Math.random() * 200, 2 + Math.random() * 6])
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
    const sparks = new THREE.Points(sparkGeo, keep(new THREE.PointsMaterial({ color: new THREE.Color(1.6, 0.9, 0.5), size: 1.4, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })))
    scene.add(sparks)

    // ---- bloom -------------------------------------------------------------
    const composer = new EffectComposer(renderer)
    composer.setPixelRatio(pr)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.05, 0.55, 0.62)
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
      [0, new THREE.Vector3(0, 320, 420), new THREE.Vector3(0, 0, 0)],
      [0.22, new THREE.Vector3(150, 120, 230), new THREE.Vector3(0, 0, 0)],
      [0.45, new THREE.Vector3(95, 78, 150), new THREE.Vector3(0, 6, 0)],
      [0.68, new THREE.Vector3(-150, 92, 110), new THREE.Vector3(0, 6, 0)],
      [0.85, new THREE.Vector3(-60, 160, -200), new THREE.Vector3(0, 0, 0)],
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
    // can't hold ~40 fps, drop to 1x pixels and half the trails.
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
          streaks.count = STREAKS / 2
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

      // streaks glide; they wrap at the city's edge
      const flow = still ? 0 : dt
      sState.forEach((st, i) => {
        st.s += st.v * flow * st.lane.dir
        if (st.s > 600) st.s -= 1200
        if (st.s < -600) st.s += 1200
        const { lane } = st
        if (lane.axis === 'x') {
          pos.set(st.s, 0.8, lane.c + lane.off)
          q.identity()
        } else {
          pos.set(lane.c + lane.off, 0.8, st.s)
          q.copy(qz)
        }
        scl.set(st.len, 1, 1)
        m4.compose(pos, q, scl)
        streaks.setMatrixAt(i, m4)
      })
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

  return <div ref={host} className="fixed inset-0 -z-10 bg-[#04060c]" aria-hidden />
}
