import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildBlinky, type RigPose } from './model'
import { BlinkySvg } from './BlinkySvg'

/**
 * Blinky's own small transparent canvas (1.8 × size px square), drawn every
 * frame from the shared pose ref — no React render per frame. Falls back to
 * the SVG Blinky if WebGL is unavailable, the context is lost, or a frame
 * throws. Releases its GL context on unmount (renderer.forceContextLoss).
 */
export function Blinky3D({ poseRef, size }: { poseRef: MutableRefObject<RigPose>; size: number }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const sizeRef = useRef(size)
  const resize = useRef<((s: number) => void) | null>(null)

  useEffect(() => {
    sizeRef.current = size
    resize.current?.(size)
  }, [size])

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      // No WebGL here: fall back to the SVG Blinky (deferred — not a
      // synchronous setState inside the effect).
      queueMicrotask(() => setFailed(true))
      return
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setClearColor(0x000000, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.1))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(2, 4, 5)
    const rim = new THREE.DirectionalLight(0x88aaff, 0.8)
    rim.position.set(-3, 2, -2)
    scene.add(key, rim)
    const rig = buildBlinky(env)
    scene.add(rig.group)

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
    camera.position.set(0, 1.3, 8.7)
    camera.lookAt(0, 1.3, 0)
    const apply = (s: number) => {
      renderer.setSize(1.8 * s, 1.8 * s, false)
      renderer.domElement.style.width = `${1.8 * s}px`
      renderer.domElement.style.height = `${1.8 * s}px`
    }
    apply(sizeRef.current)
    resize.current = apply

    const onLost = (e: Event) => {
      e.preventDefault()
      setFailed(true)
    }
    renderer.domElement.addEventListener('webglcontextlost', onLost)

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      try {
        rig.update(poseRef.current, dt)
        renderer.render(scene, camera)
      } catch {
        setFailed(true)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      resize.current = null
      renderer.domElement.removeEventListener('webglcontextlost', onLost)
      rig.dispose()
      env.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [poseRef])

  if (failed) return <BlinkySvg poseRef={poseRef} size={size} />
  return <div ref={host} className="pointer-events-none absolute inset-0" />
}
