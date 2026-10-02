import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js'
import { buildSparky, HANDLE_COUNT, type RigPose } from './model'
import { BlinkySvg } from './BlinkySvg'

/** Where each antenna tip is, in this canvas's CSS pixels (the drag handles). */
export type HandleSpots = { x: number; y: number; visible: boolean }[]

export function emptyHandleSpots(): HandleSpots {
  return Array.from({ length: HANDLE_COUNT }, () => ({ x: 0, y: 0, visible: false }))
}

/**
 * Transparency after bloom. UnrealBloomPass's blur writes alpha 1 across
 * the whole canvas (a dark square over the page), so alpha is rebuilt
 * here: the scene's own alpha (rendered separately, before bloom) or the
 * glow's brightness, whichever is higher — Sparky is opaque, his halo fades
 * smoothly into the page.
 */
const AlphaFromLight = {
  uniforms: { tDiffuse: { value: null }, tScene: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:
    'uniform sampler2D tDiffuse; uniform sampler2D tScene; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float sa = texture2D(tScene, vUv).a; float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x) * smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.86, vUv.y); float glow = max(c.r, max(c.g, c.b)) * edge; float a = clamp(max(sa, glow), 0.0, 1.0); gl_FragColor = vec4(min(c * max(edge, sa), vec3(a)), a); }',
}

export interface BotView {
  resize(cssPx: number): void
  dispose(): void
}

/**
 * Mount Sparky's renderer into `el`: a square transparent canvas `cssPx`
 * wide. Ultra quality (Section 40): supersampled (up to 3x), 4x MSAA,
 * physical materials lit by a studio environment plus warm golden rim
 * lights, and a real bloom pass (Section 41). `turn` (radians) spins him on the spot —
 * the preview page's turnaround; the console leaves it at 0.
 */
export function mountBot(
  el: HTMLElement,
  opts: { pose: () => RigPose; cssPx: number; handles?: () => HandleSpots | undefined; turn?: () => number; onFail: (err?: unknown) => void },
): BotView | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  const pr = Math.min(3, (window.devicePixelRatio || 1) * 1.5)
  renderer.setPixelRatio(pr)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  el.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a2018, 0.55))
  const key = new THREE.DirectionalLight(0xfff0e0, 1.3)
  key.position.set(2.5, 4, 5)
  const fill = new THREE.DirectionalLight(0xc9dbff, 0.35)
  fill.position.set(-4, 1.5, 3)
  const rimL = new THREE.DirectionalLight(0xff5a3a, 1.8)
  rimL.position.set(-3, 3, -4)
  const rimR = new THREE.DirectionalLight(0xff8a4a, 1.5)
  rimR.position.set(3, 2.5, -4)
  scene.add(key, fill, rimL, rimR)
  const rig = buildSparky(env)
  const spinner = new THREE.Group()
  spinner.add(rig.group)
  scene.add(spinner)

  // a little above eye level, like the design sheet's turnaround
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  camera.position.set(0, 2.2, 8.5)
  camera.lookAt(0, 1.3, 0)

  // the scene renders once into its own target (keeping its true alpha);
  // the composer blooms a copy of it, then rebuilds alpha from both
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  const composer = new EffectComposer(renderer, target)
  composer.setPixelRatio(pr)
  composer.addPass(new TexturePass(sceneRT.texture))
  // only genuinely bright light blooms: eyes, antenna tips, chest core, thruster flames
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.3, 2.2))
  composer.addPass(new OutputPass())
  const alphaPass = new ShaderPass(AlphaFromLight)
  alphaPass.uniforms.tScene.value = sceneRT.texture
  composer.addPass(alphaPass)

  let css = opts.cssPx
  const resize = (px: number) => {
    css = Math.round(px)
    renderer.setSize(css, css, false)
    renderer.domElement.style.width = `${css}px`
    renderer.domElement.style.height = `${css}px`
    composer.setSize(css, css)
    sceneRT.setSize(css * pr, css * pr)
  }
  resize(css)

  const onLost = (e: Event) => {
    e.preventDefault()
    opts.onFail()
  }
  renderer.domElement.addEventListener('webglcontextlost', onLost)

  const v = new THREE.Vector3()
  let raf = 0
  let last = performance.now()
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    try {
      spinner.rotation.y = opts.turn?.() ?? 0
      rig.update(opts.pose(), dt)
      renderer.setRenderTarget(sceneRT)
      renderer.clear()
      renderer.render(scene, camera)
      renderer.setRenderTarget(null)
      composer.render(dt)
      // where the antenna tips landed on screen, for their drag handles
      const spots = opts.handles?.()
      if (spots) {
        rig.handles.forEach((o, i) => {
          o.getWorldPosition(v).project(camera)
          spots[i].x = ((v.x + 1) / 2) * css
          spots[i].y = ((1 - v.y) / 2) * css
          spots[i].visible = o.visible
        })
      }
    } catch (err) {
      opts.onFail(err)
      return
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    resize,
    dispose: () => {
      cancelAnimationFrame(raf)
      renderer.domElement.removeEventListener('webglcontextlost', onLost)
      rig.dispose()
      env.dispose()
      composer.dispose()
      target.dispose()
      sceneRT.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}

/**
 * Sparky's own transparent canvas (1.8 × size px square), drawn every frame
 * from the shared pose ref — no React render per frame. Falls back to the
 * SVG figure if WebGL is unavailable, the context is lost, or a frame
 * throws. Releases its GL context on unmount.
 */
export function Blinky3D({ poseRef, size, handlesRef }: { poseRef: MutableRefObject<RigPose>; size: number; handlesRef?: MutableRefObject<HandleSpots> }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const sizeRef = useRef(size)
  const view = useRef<BotView | null>(null)

  useEffect(() => {
    sizeRef.current = size
    view.current?.resize(1.8 * size)
  }, [size])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const v = mountBot(el, {
      pose: () => poseRef.current,
      cssPx: 1.8 * sizeRef.current,
      handles: () => handlesRef?.current,
      onFail: (err) => {
        if (err) console.error('[Sparky] 3D frame failed, using the 2D figure:', err)
        // deferred — never a synchronous setState inside an effect
        queueMicrotask(() => setFailed(true))
      },
    })
    if (!v) {
      queueMicrotask(() => setFailed(true))
      return
    }
    view.current = v
    return () => {
      view.current = null
      v.dispose()
    }
  }, [poseRef, handlesRef])

  if (failed) return <BlinkySvg poseRef={poseRef} size={size} />
  return <div ref={host} className="pointer-events-none absolute inset-0" />
}
