import * as THREE from 'three'
import type { Anim, Mood, Prop } from './types'
import { drawFace, expressionFor } from './zenFace'
import {
  faceCanvas,
  glowTexture,
  hatTexture,
  lotusTexture,
  orbTexture,
  robeInnerTexture,
  robeOuterTexture,
  scarfTexture,
  sigilTexture,
  tagTexture,
} from './zenTextures'

export interface RigPose {
  mood: Mood
  anim: Anim
  /** Seconds since `anim` started. */
  animT: number
  squash: number
  tilt: number
  /** -1 facing left, 1 right, 0 straight at you. */
  facing: number
  /** -1..1 each — where the eyes look. */
  look: { x: number; y: number }
  prop: Prop
  scale: number
  /** Seconds, free-running clock. */
  t: number
  air: boolean
  /** The floating orb the user is dragging (hidden from the orbit), or null. */
  orbHeld: number | null
}

export function restPose(): RigPose {
  return { mood: 'happy', anim: 'idle', animT: 0, squash: 1, tilt: 0, facing: 1, look: { x: 0, y: 0 }, prop: null, scale: 1, t: 0, air: false, orbHeld: null }
}

const MOOD_HEX: Record<Exclude<Mood, 'disco'>, string> = { happy: '#ffcf6e', curious: '#ffb020', sad: '#e8a35a', sleepy: '#b88a3a' }
const DISCO = ['#ff3b47', '#ffb020', '#2af28e']

/** The eye glow colour for the 2D fallback. */
export function moodColour(m: Mood, t: number): string {
  return m === 'disco' ? DISCO[Math.floor(t * 6) % 3] : MOOD_HEX[m]
}

/** Zen's floating orbs — the drag-to-explain handles (BlinkyRoot puts hit areas on them). */
export const ORB_COUNT = 3

export interface Rig {
  group: THREE.Group
  update(p: RigPose, dt: number): void
  dispose(): void
  /** The floating orbs, for projecting their screen positions. */
  orbs: THREE.Object3D[]
}

function signTexture(text: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 320
  const g = c.getContext('2d')
  if (!g) throw new Error('2D canvas unavailable')
  g.fillStyle = '#7a5530'
  g.fillRect(0, 0, 512, 320)
  g.fillStyle = bg
  g.fillRect(24, 24, 464, 272)
  g.strokeStyle = '#f6d27c'
  g.lineWidth = 10
  g.strokeRect(24, 24, 464, 272)
  g.fillStyle = '#ffffff'
  g.font = '900 150px Orbitron, Poppins, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 256, 170)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A lathe whose vertices can be waved each frame (robe hems, sleeves). */
function cloth(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  return { geo, pos, base: Float32Array.from(pos.array as Float32Array) }
}

/**
 * Zen in 3D (Section 40), from the owner's design sheet: an ivory ceramic
 * robot monk with a glossy black face screen and golden eyes, side
 * antennas with glowing orb tips, a woven conical hat (emblem, tassels,
 * charm tag), a layered charcoal-and-ivory robe with gold patterns, a
 * golden scarf, prayer beads, a lotus chest core, three floating swirl
 * orbs and a rippling golden aura. He floats; everything sways.
 *
 * Units: the aura sits at y = 0 and the hat's tip near y = 2.6, so the
 * canvas geometry contract of Blinky3D is unchanged.
 */
export function buildZen(env: THREE.Texture | null = null): Rig {
  const trash: { dispose(): void }[] = []
  const keep = <T extends { dispose(): void }>(x: T): T => {
    trash.push(x)
    return x
  }
  const s = Math.sin

  // ---------------------------------------------------------------- materials
  const ceramic = keep(new THREE.MeshPhysicalMaterial({ color: '#ece6da', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 0.75 }))
  const gold = keep(new THREE.MeshPhysicalMaterial({ color: '#e2aa45', roughness: 0.2, metalness: 1, clearcoat: 0.5, envMap: env, envMapIntensity: 1.6 }))
  const blackGloss = keep(new THREE.MeshPhysicalMaterial({ color: '#030304', roughness: 0.1, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMap: env, envMapIntensity: 0.55 }))
  const wood = keep(new THREE.MeshPhysicalMaterial({ color: '#6b3f1f', roughness: 0.45, clearcoat: 0.6, envMap: env }))
  const tasselMat = keep(new THREE.MeshPhysicalMaterial({ color: '#e5a83c', roughness: 0.7, sheen: 1, sheenColor: new THREE.Color('#ffe2a0'), envMap: env }))
  const hatTex = keep(hatTexture())
  const hatMat = keep(new THREE.MeshPhysicalMaterial({ map: hatTex, roughness: 0.78, sheen: 0.12, sheenColor: new THREE.Color('#fff2cc'), side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.35 }))
  const outerTex = keep(robeOuterTexture())
  const outerMat = keep(new THREE.MeshPhysicalMaterial({ map: outerTex, roughness: 0.78, sheen: 1, sheenColor: new THREE.Color('#9a7a3a'), sheenRoughness: 0.45, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.5 }))
  const innerTex = keep(robeInnerTexture())
  const innerMat = keep(new THREE.MeshPhysicalMaterial({ map: innerTex, roughness: 0.85, sheen: 0.8, sheenColor: new THREE.Color('#fff4d6'), side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.4 }))
  const scarfTex = keep(scarfTexture())
  const scarfMat = keep(new THREE.MeshPhysicalMaterial({ map: scarfTex, roughness: 0.42, sheen: 1, sheenColor: new THREE.Color('#ffe08a'), sheenRoughness: 0.3, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.8 }))
  const glowTex = keep(glowTexture())
  const glowMat = (strength: number) =>
    keep(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.6 * strength, 1.1 * strength, 0.45 * strength), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  const emissive = (hex: string, k: number) => keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false }))

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    keep(geo)
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = false
    return m
  }

  const group = new THREE.Group()
  const inner = new THREE.Group()
  inner.scale.setScalar(0.88)
  group.add(inner)
  const body = new THREE.Group()
  inner.add(body)

  // ---------------------------------------------------------------- robes
  // inner cloth (full), hem -> neck: v=1 at the neck (its gold collar band)
  const innerPts = [
    [0.55, 0.0],
    [0.59, 0.04],
    [0.55, 0.24],
    [0.48, 0.5],
    [0.42, 0.72],
    [0.36, 0.9],
    [0.25, 1.02],
    [0.19, 1.07],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const innerCloth = cloth(new THREE.LatheGeometry(innerPts, 128))
  body.add(mesh(innerCloth.geo, innerMat))
  // outer robe, neck -> hem (v=1 at the hem's gold band), open at the front
  const outerPts = [
    [0.27, 1.07],
    [0.41, 1.0],
    [0.48, 0.84],
    [0.54, 0.6],
    [0.62, 0.32],
    [0.71, 0.08],
    [0.75, -0.03],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const outerCloth = cloth(new THREE.LatheGeometry(outerPts, 128, 0.36, Math.PI * 2 - 0.72))
  body.add(mesh(outerCloth.geo, outerMat))

  // chest core: a glowing lotus in a gold ring
  const core = new THREE.Group()
  core.position.set(0, 0.6, 0.5)
  core.rotation.x = -0.18
  const lotusTex = keep(lotusTexture())
  const coreMat = keep(new THREE.MeshBasicMaterial({ map: lotusTex, color: new THREE.Color(2.2, 1.8, 1.3), toneMapped: false, transparent: true }))
  core.add(mesh(new THREE.CircleGeometry(0.11, 64), coreMat))
  const coreRing = mesh(new THREE.TorusGeometry(0.12, 0.022, 24, 96), gold)
  core.add(coreRing)
  body.add(core)

  // boots peeking out under the hem
  const feet: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const f = new THREE.Group()
    f.position.set(side * 0.17, 0.04, 0.3)
    const boot = mesh(new THREE.SphereGeometry(0.11, 48, 32), ceramic)
    boot.scale.set(1, 0.72, 1.35)
    const toe = mesh(new THREE.SphereGeometry(0.075, 32, 24), blackGloss)
    toe.position.set(0, -0.005, 0.1)
    toe.scale.set(1.1, 0.8, 0.9)
    const band = mesh(new THREE.TorusGeometry(0.1, 0.012, 12, 48), gold)
    band.rotation.x = Math.PI / 2
    band.position.y = 0.03
    f.add(boot, toe, band)
    feet.push(f)
    body.add(f)
  }

  // ---------------------------------------------------------------- arms
  type Arm = { shoulder: THREE.Group; elbow: THREE.Group; sleeve: ReturnType<typeof cloth> }
  const sleevePts = [
    [0.085, 0.0],
    [0.11, -0.1],
    [0.16, -0.24],
    [0.2, -0.33],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const makeArm = (side: number): Arm => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.43, 0.96, 0)
    const pad = mesh(new THREE.SphereGeometry(0.13, 48, 32), ceramic)
    pad.scale.set(1, 0.82, 1)
    const padRing = mesh(new THREE.TorusGeometry(0.115, 0.014, 12, 64), gold)
    padRing.rotation.x = Math.PI / 2
    padRing.position.y = -0.04
    const sleeve = cloth(new THREE.LatheGeometry(sleevePts, 64))
    const sleeveMesh = mesh(sleeve.geo, outerMat)
    const cuff = mesh(new THREE.TorusGeometry(0.2, 0.016, 12, 64), gold)
    cuff.rotation.x = Math.PI / 2
    cuff.position.y = -0.33
    const upper = mesh(new THREE.CapsuleGeometry(0.068, 0.14, 8, 24), ceramic)
    upper.position.y = -0.13
    const elbow = new THREE.Group()
    elbow.position.y = -0.27
    const joint = mesh(new THREE.TorusGeometry(0.06, 0.016, 12, 48), gold)
    joint.rotation.x = Math.PI / 2
    const fore = mesh(new THREE.CapsuleGeometry(0.058, 0.12, 8, 24), blackGloss)
    fore.position.y = -0.1
    const hand = new THREE.Group()
    hand.position.y = -0.24
    const palm = mesh(new THREE.SphereGeometry(0.075, 40, 28), ceramic)
    palm.scale.set(1, 0.92, 0.72)
    const knuckle = mesh(new THREE.TorusGeometry(0.05, 0.01, 10, 40), gold)
    knuckle.rotation.x = Math.PI / 2
    knuckle.position.y = 0.04
    hand.add(palm, knuckle)
    for (let k = 0; k < 3; k++) {
      const fng = mesh(new THREE.CapsuleGeometry(0.019, 0.05, 6, 12), ceramic)
      fng.position.set((k - 1) * 0.035, -0.085, 0.01)
      hand.add(fng)
    }
    const thumb = mesh(new THREE.CapsuleGeometry(0.019, 0.04, 6, 12), ceramic)
    thumb.position.set(-side * 0.065, -0.035, 0.03)
    thumb.rotation.z = side * 0.9
    hand.add(thumb)
    elbow.add(joint, fore, hand)
    shoulder.add(pad, padRing, sleeveMesh, cuff, upper, elbow)
    body.add(shoulder)
    return { shoulder, elbow, sleeve }
  }
  const L = makeArm(-1)
  const R = makeArm(1)

  // ---------------------------------------------------------------- scarf, beads
  const scarfWrap = mesh(new THREE.TorusGeometry(0.29, 0.085, 32, 128), scarfMat)
  scarfWrap.rotation.x = Math.PI / 2
  scarfWrap.position.y = 1.07
  scarfWrap.scale.set(1, 1, 0.8)
  body.add(scarfWrap)
  type Tail = { mesh: THREE.Mesh; c: ReturnType<typeof cloth>; phase: number }
  const tails: Tail[] = []
  for (const [x, y, z, ry, len, phase] of [
    [-0.2, 1.02, 0.2, 0.5, 1.15, 0],
    [0.24, 1.04, -0.12, -0.9, 1.3, 1.7],
  ] as const) {
    const geo = new THREE.PlaneGeometry(0.17, len, 1, 48)
    geo.translate(0, -len / 2, 0)
    const c = cloth(geo)
    const m = mesh(geo, scarfMat)
    m.position.set(x, y, z)
    m.rotation.y = ry
    body.add(m)
    tails.push({ mesh: m, c, phase })
  }
  const beads = new THREE.Group()
  const beadGeoS = keep(new THREE.SphereGeometry(0.034, 24, 16))
  const beadGeoL = keep(new THREE.SphereGeometry(0.046, 32, 20))
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2
    const big = i % 5 === 0
    const m = new THREE.Mesh(big ? beadGeoL : beadGeoS, big ? gold : i % 2 ? wood : blackGloss)
    m.position.set(Math.sin(a) * 0.35, 0.97 - 0.15 * ((Math.cos(a) + 1) / 2), Math.cos(a) * 0.33)
    beads.add(m)
  }
  const pendant = new THREE.Group()
  pendant.position.set(0, 0.79, 0.4)
  const pBall = mesh(new THREE.SphereGeometry(0.06, 48, 32), gold)
  const pTassel = mesh(new THREE.ConeGeometry(0.035, 0.12, 24), tasselMat)
  pTassel.position.y = -0.11
  pendant.add(pBall, pTassel)
  beads.add(pendant)
  body.add(beads)

  // ---------------------------------------------------------------- head
  const head = new THREE.Group()
  head.position.y = 1.68
  body.add(head)
  const skull = mesh(new THREE.SphereGeometry(0.6, 128, 96), ceramic)
  skull.scale.set(1.06, 0.93, 1)
  head.add(skull)
  // face screen: a glossy black cap across the front, eyes drawn on a second cap
  const capArgs = [128, 64, Math.PI / 2 - 0.8, 1.6, Math.PI / 2 - 0.55, 1.08] as const
  // the face: deep black glass — only a faint reflection, so the eyes carry it
  const screenMat = keep(new THREE.MeshPhysicalMaterial({ color: '#010102', roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, envMap: env, envMapIntensity: 0.18 }))
  const screen = mesh(new THREE.SphereGeometry(0.606, ...capArgs), screenMat)
  screen.scale.copy(skull.scale)
  head.add(screen)
  const face = faceCanvas()
  keep(face.texture)
  const eyesMat = keep(new THREE.MeshBasicMaterial({ map: face.texture, color: new THREE.Color(2.4, 1.9, 1.15), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  const eyes = mesh(new THREE.SphereGeometry(0.611, ...capArgs), eyesMat)
  eyes.scale.copy(skull.scale)
  head.add(eyes)

  // ear pods and the antennas growing out of them
  const antennas: THREE.Group[] = []
  const tipMats: THREE.MeshBasicMaterial[] = []
  for (const side of [-1, 1]) {
    const pod = new THREE.Group()
    pod.position.set(side * 0.64, 0.0, 0)
    const shell = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 64), ceramic)
    shell.rotation.z = Math.PI / 2
    const ring = mesh(new THREE.TorusGeometry(0.2, 0.034, 24, 96), gold)
    ring.rotation.y = Math.PI / 2
    ring.position.x = side * 0.08
    const lens = mesh(new THREE.CircleGeometry(0.12, 48), emissive('#ffb347', 2.6))
    lens.rotation.y = side * Math.PI / 2
    lens.position.x = side * 0.082
    pod.add(shell, ring, lens)
    const ant = new THREE.Group()
    ant.position.set(side * 0.06, 0.12, 0)
    const rod = mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.56, 24), gold)
    rod.position.y = 0.28
    const collar = mesh(new THREE.TorusGeometry(0.035, 0.012, 12, 32), gold)
    collar.rotation.x = Math.PI / 2
    collar.position.y = 0.52
    const tipMat = emissive('#ffc86a', 3.2)
    tipMats.push(tipMat)
    const tip = mesh(new THREE.SphereGeometry(0.075, 48, 32), tipMat)
    tip.position.y = 0.6
    const tipGlow = new THREE.Sprite(glowMat(0.9))
    tipGlow.scale.setScalar(0.42)
    tipGlow.position.y = 0.6
    ant.add(rod, collar, tip, tipGlow)
    pod.add(ant)
    antennas.push(ant)
    head.add(pod)
  }

  // ---------------------------------------------------------------- hat
  const hat = new THREE.Group()
  hat.position.y = 0.42
  head.add(hat)
  const hatPts = [
    [0.001, 0.61],
    [0.06, 0.59],
    [0.16, 0.535],
    [0.32, 0.435],
    [0.52, 0.305],
    [0.74, 0.175],
    [0.95, 0.065],
    [1.12, -0.005],
    [1.15, -0.035],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const cone = mesh(new THREE.LatheGeometry(hatPts, 160), hatMat)
  cone.rotation.y = Math.PI // the emblem (u = 0.5) to the front
  hat.add(cone)
  const brim = mesh(new THREE.TorusGeometry(1.135, 0.024, 16, 192), gold)
  brim.rotation.x = Math.PI / 2
  brim.position.y = -0.028
  const knob = mesh(new THREE.SphereGeometry(0.075, 48, 32), blackGloss)
  knob.position.y = 0.64
  const knobRing = mesh(new THREE.TorusGeometry(0.06, 0.014, 12, 48), gold)
  knobRing.rotation.x = Math.PI / 2
  knobRing.position.y = 0.6
  hat.add(brim, knob, knobRing)
  // tassels and the charm tag, each a little pendulum on the brim
  const tagTex = keep(tagTexture())
  const tagMat = keep(new THREE.MeshPhysicalMaterial({ map: tagTex, metalness: 0.7, roughness: 0.3, envMap: env, envMapIntensity: 1.2 }))
  const pendulums: THREE.Group[] = []
  const tasselCount = 8
  for (let i = 0; i < tasselCount; i++) {
    const a = (i / tasselCount) * Math.PI * 2 + Math.PI / tasselCount
    const p = new THREE.Group()
    const r = 1.02
    p.position.set(Math.sin(a) * r, 0.02, Math.cos(a) * r)
    const string = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 8), gold)
    string.position.y = -0.1
    p.add(string)
    if (i === 1) {
      const tag = mesh(new THREE.BoxGeometry(0.11, 0.24, 0.012), tagMat)
      tag.position.y = -0.33
      tag.rotation.y = -a
      const ring = mesh(new THREE.TorusGeometry(0.02, 0.006, 8, 24), gold)
      ring.position.y = -0.2
      p.add(tag, ring)
    } else {
      const bead = mesh(new THREE.SphereGeometry(0.03, 24, 16), gold)
      bead.position.y = -0.22
      const tassel = mesh(new THREE.ConeGeometry(0.038, 0.14, 24), tasselMat)
      tassel.position.y = -0.31
      p.add(bead, tassel)
    }
    hat.add(p)
    pendulums.push(p)
  }

  // ---------------------------------------------------------------- orbs
  const orbTex = keep(orbTexture())
  const orbMat = keep(new THREE.MeshPhysicalMaterial({ color: '#020202', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new THREE.Color('#ffb54a'), emissiveMap: orbTex, emissiveIntensity: 3.2, envMap: env, envMapIntensity: 0.35 }))
  const orbGeo = keep(new THREE.SphereGeometry(0.125, 64, 48))
  const orbs: THREE.Group[] = []
  for (let i = 0; i < ORB_COUNT; i++) {
    const o = new THREE.Group()
    const ball = new THREE.Mesh(orbGeo, orbMat)
    const halo = new THREE.Sprite(glowMat(0.8))
    halo.scale.setScalar(0.6)
    o.add(ball, halo)
    inner.add(o)
    orbs.push(o)
  }

  // ---------------------------------------------------------------- aura
  const aura = new THREE.Group()
  aura.rotation.x = -Math.PI / 2 + 0.12
  inner.add(aura)
  const discMat = keep(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: { k: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform float k; varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5)) * 2.0; float a = smoothstep(1.0, 0.0, d); a = a * a * 0.85; gl_FragColor = vec4(vec3(1.3, 0.85, 0.3) * a * k * 0.7, a * k * 0.7); }',
    }),
  )
  aura.add(mesh(new THREE.CircleGeometry(1.0, 96), discMat))
  const sigilTex = keep(sigilTexture())
  const sigilMat = keep(new THREE.MeshBasicMaterial({ map: sigilTex, color: new THREE.Color(1.7, 1.25, 0.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  const sigil = mesh(new THREE.PlaneGeometry(1.9, 1.9), sigilMat)
  sigil.position.z = 0.002
  aura.add(sigil)
  const ripples: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = []
  for (let i = 0; i < 3; i++) {
    const mat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.25, 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
    const m = mesh(new THREE.RingGeometry(0.965, 1.0, 160), mat)
    m.position.z = 0.004
    aura.add(m)
    ripples.push({ m, mat })
  }
  // rising sparkles
  const SPARKS = 90
  const sparkSeed = Array.from({ length: SPARKS }, () => [Math.random() * Math.PI * 2, Math.sqrt(Math.random()) * 0.85, Math.random(), 0.15 + Math.random() * 0.25] as const)
  const sparkGeo = keep(new THREE.BufferGeometry())
  const sparkPos = new Float32Array(SPARKS * 3)
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
  const sparkMat = keep(new THREE.PointsMaterial({ map: glowTex, size: 0.07, color: new THREE.Color(2.2, 1.6, 0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  const sparks = new THREE.Points(sparkGeo, sparkMat)
  inner.add(sparks)

  // ---------------------------------------------------------------- props
  const props = new THREE.Group()
  body.add(props)
  // siren: a blue and a red lamp on the hat's tip
  const sirenBlue = emissive('#3b7bff', 3)
  const sirenRed = emissive('#ff3b47', 3)
  const siren = new THREE.Group()
  siren.position.set(0, 2.22, 0)
  for (const [x, m] of [
    [-0.08, sirenBlue],
    [0.08, sirenRed],
  ] as const) {
    const b = mesh(new THREE.SphereGeometry(0.07, 32, 24), m)
    b.position.x = x
    siren.add(b)
  }
  props.add(siren)
  // a red paper parasol held over the hat
  const umbrella = new THREE.Group()
  umbrella.position.set(0.5, 1.2, 0)
  const paper = keep(new THREE.MeshPhysicalMaterial({ color: '#b3262a', roughness: 0.6, sheen: 0.6, side: THREE.DoubleSide, envMap: env }))
  const canopy = mesh(new THREE.ConeGeometry(1.0, 0.32, 24, 1, true), paper)
  canopy.position.y = 1.55
  const shaft = mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.6, 12), wood)
  shaft.position.y = 0.78
  umbrella.add(canopy, shaft)
  props.add(umbrella)
  // the traffic cop's sign
  const signStopTex = keep(signTexture('STOP', '#c62828'))
  const signGoTex = keep(signTexture('GO', '#2e7d32'))
  const makeSign = (t: THREE.Texture) => {
    const g = new THREE.Group()
    const board = mesh(new THREE.BoxGeometry(0.62, 0.39, 0.03), keep(new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.5, envMap: env })))
    board.position.y = 0.62
    const stick = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 12), wood)
    stick.position.y = 0.2
    g.add(board, stick)
    g.position.set(0.62, 0.55, 0.18)
    props.add(g)
    return g
  }
  const signStop = makeSign(signStopTex)
  const signGo = makeSign(signGoTex)
  // a folding paper fan
  const fanMat = keep(new THREE.MeshPhysicalMaterial({ color: '#f1d79a', roughness: 0.6, side: THREE.DoubleSide, envMap: env }))
  const fan = mesh(new THREE.CircleGeometry(0.26, 32, 0, Math.PI), fanMat)
  fan.position.set(0.62, 0.62, 0.25)
  props.add(fan)

  // ---------------------------------------------------------------- animation
  let blinkTimer = 2.5
  let blinking = 0
  let spin = 0
  let faceKey = ''

  /** Ripple a lathe's vertices; `weight(y)` says how free each height is (0 pinned .. 1 hem). */
  const waveCloth = (c: ReturnType<typeof cloth>, t: number, amp: number, weight: (y: number) => number, sway: number) => {
    const b = c.base
    const a = c.pos.array as Float32Array
    for (let i = 0; i < b.length; i += 3) {
      const x = b[i]
      const y = b[i + 1]
      const z = b[i + 2]
      const w = Math.max(0, Math.min(1, weight(y))) ** 1.6
      if (w === 0) {
        a[i] = x
        a[i + 1] = y
        a[i + 2] = z
        continue
      }
      const ang = Math.atan2(x, z)
      const k = 1 + w * amp * (0.6 * s(t * 2.1 + ang * 3) + 0.4 * s(t * 3.3 - ang * 5))
      a[i] = x * k + w * sway
      a[i + 1] = y + w * 0.012 * s(t * 2.6 + ang * 4)
      a[i + 2] = z * k
    }
    c.pos.needsUpdate = true
    c.geo.computeVertexNormals()
  }

  function update(p: RigPose, dt: number) {
    const t = p.t
    const a = p.animT
    const asleep = p.anim === 'sleep'
    const moving = p.air || p.anim === 'walk' || p.anim === 'held'

    // float: he hovers above his aura, bobbing gently
    const hover = p.anim === 'ride' ? 0.04 : 0.24
    const bob = (asleep ? 0.025 : 0.06) * s(t * 1.5)
    const breathe = asleep ? 0.025 * s(t * 1.4) : 0.012 * s(t * 2.2)
    const sq = p.squash
    body.position.set(0, hover + bob, 0)
    body.scale.set(1 / Math.sqrt(sq), sq + breathe, 1 / Math.sqrt(sq))
    body.rotation.set(0, 0, THREE.MathUtils.degToRad(-p.tilt))
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, p.facing * 0.38 + p.look.x * 0.14, Math.min(1, dt * 6))
    group.scale.setScalar(p.scale)
    head.rotation.set(-p.look.y * 0.12, 0, 0)

    // face: eye-only expressions, blinking, looking, dizzy spirals
    blinkTimer -= dt
    if (blinkTimer <= 0) {
      blinking = 0.16
      blinkTimer = 2.4 + Math.random() * 3.6
    }
    blinking = Math.max(0, blinking - dt)
    const blink = blinking > 0 ? Math.sin((blinking / 0.16) * Math.PI) : 0
    spin += dt * 9
    const expr = expressionFor(p.anim, p.mood)
    const dizzy = p.anim === 'dizzy'
    const lookX = dizzy ? Math.cos(spin) : THREE.MathUtils.clamp(p.look.x, -1, 1)
    const lookY = dizzy ? Math.sin(spin) : THREE.MathUtils.clamp(-p.look.y, -1, 1)
    const animated = expr === 'sleepy' || expr === 'excited'
    const key = `${expr}|${lookX.toFixed(2)}|${lookY.toFixed(2)}|${blink.toFixed(2)}|${animated ? Math.floor(t * 24) : 0}|${p.prop === 'shades'}`
    if (key !== faceKey) {
      faceKey = key
      drawFace(face.ctx, face.canvas.width, face.canvas.height, { expr, lookX, lookY, blink, t, shades: p.prop === 'shades' })
      face.texture.needsUpdate = true
    }
    eyesMat.color.setRGB(2.4, 1.9, 1.15).multiplyScalar(asleep ? 0.55 : 1)

    // chest core and antenna tips breathe with light
    coreMat.color.setRGB(2.2, 1.8, 1.3).multiplyScalar(0.8 + 0.35 * (0.5 + 0.5 * s(t * 2)))
    tipMats.forEach((m, i) => m.color.set('#ffc86a').multiplyScalar(2.4 + 1.2 * (0.5 + 0.5 * s(t * 3 + i * 1.7))))
    // antennas: springy bounce, more when he moves
    antennas.forEach((ant, i) => {
      const side = i === 0 ? -1 : 1
      const wob = (moving ? 0.16 : 0.06) * s(t * (moving ? 9 : 2.6) + i * 1.3)
      ant.rotation.z = -side * 0.42 + wob - p.tilt * 0.004
      ant.rotation.x = 0.05 * s(t * 2 + i)
    })

    // hat sway and its tassels swinging like little pendulums
    hat.rotation.z = 0.02 * s(t * 1.3) + p.tilt * 0.002
    hat.rotation.x = 0.015 * s(t * 1.1 + 1)
    pendulums.forEach((pd, i) => {
      const amp = moving ? 0.28 : 0.09
      pd.rotation.x = amp * s(t * 2.3 + i * 0.9)
      pd.rotation.z = amp * 0.7 * s(t * 1.9 + i * 1.7) - p.tilt * 0.006
    })

    // cloth: robe hems and sleeves ripple; the scarf's tails stream
    const flow = moving ? 0.06 : 0.03
    const sway = -p.tilt * 0.004 + (moving ? 0.03 * s(t * 4) : 0)
    waveCloth(innerCloth, t, flow * 0.8, (y) => (0.7 - y) / 0.7, sway)
    waveCloth(outerCloth, t + 0.4, flow, (y) => (0.75 - y) / 0.75, sway * 1.2)
    waveCloth(L.sleeve, t, 0.06, (y) => -y / 0.33, 0)
    waveCloth(R.sleeve, t + 1, 0.06, (y) => -y / 0.33, 0)
    tails.forEach(({ c, phase }) => {
      const b = c.base
      const arr = c.pos.array as Float32Array
      for (let i = 0; i < b.length; i += 3) {
        const k = Math.min(1, -b[i + 1] / 1.3)
        const gust = moving ? 2.2 : 1
        arr[i] = b[i] + k * 0.13 * gust * s(t * 2.4 - k * 4 + phase)
        arr[i + 1] = b[i + 1] + k * k * 0.12 * (moving ? 1 : 0.4)
        arr[i + 2] = b[i + 2] - k * k * 0.32 * gust + k * 0.06 * s(t * 1.7 - k * 3 + phase)
      }
      c.pos.needsUpdate = true
      c.geo.computeVertexNormals()
    })

    // the floating orbs circle him (faster when he's excited or flying)
    const fast = p.air || p.anim === 'dance' || p.anim === 'cheer' || p.prop === 'propeller'
    orbs.forEach((o, i) => {
      const th = t * (fast ? 2.4 : 0.55) + (i * Math.PI * 2) / ORB_COUNT
      // chest height, so a passing orb never covers his face
      o.position.set(Math.cos(th) * 1.2, body.position.y + 0.78 + 0.1 * s(t * 1.4 + i * 2), Math.sin(th) * 0.66)
      o.children[0].rotation.y += dt * 1.4
      o.visible = p.orbHeld !== i
    })

    // the aura: glowing disc, slowly turning sigil, expanding ripples, rising sparks
    const glow = asleep ? 0.45 : p.anim === 'ride' ? 0 : 1
    aura.visible = glow > 0
    sparks.visible = glow > 0
    discMat.uniforms.k.value = glow * (0.85 + 0.15 * s(t * 2))
    sigil.rotation.z = t * 0.18
    sigilMat.opacity = 0.75 * glow
    ripples.forEach((r, i) => {
      const k = (t * 0.42 + i / 3) % 1
      r.m.scale.setScalar(0.25 + k * 1.15)
      r.mat.opacity = (1 - k) * 0.9 * glow
    })
    for (let i = 0; i < SPARKS; i++) {
      const [ang, rad, off, sp] = sparkSeed[i]
      const h = (t * sp + off) % 1
      sparkPos[i * 3] = Math.cos(ang + t * 0.3) * rad * (1 - h * 0.4)
      sparkPos[i * 3 + 1] = h * 1.5
      sparkPos[i * 3 + 2] = Math.sin(ang + t * 0.3) * rad * 0.55 * (1 - h * 0.4)
    }
    sparkGeo.getAttribute('position').needsUpdate = true
    sparkMat.opacity = glow

    // arms: "raise" angles (0 = hanging, ~2.9 = straight up), elbows bend
    let lr = 0.32
    let rr = 0.32
    let le = 0.35
    let re = 0.35
    let swing = s(t * 1.5) * 0.05
    let kick = 0
    switch (p.anim) {
      case 'walk': swing = s(t * 6) * 0.35; kick = s(t * 6) * 0.25; break
      case 'air': lr = rr = 1.0; le = re = 0.5; break
      case 'wave': rr = 2.6; re = 0.6 + s(a * 12) * 0.45; break
      case 'cheer': lr = rr = 2.7 + s(a * 16) * 0.15; body.position.y += Math.abs(s(a * 9)) * 0.22; break
      case 'dizzy': body.rotation.z += s(a * 8) * 0.16; lr = rr = 0.7; break
      case 'backflip': {
        const k = Math.min(1, a / 0.9)
        body.position.y += s(k * Math.PI) * 0.85
        body.rotation.x = -k * Math.PI * 2
        lr = rr = 2.3
        break
      }
      case 'yawn': lr = rr = 2.9; le = re = 0.5; break
      case 'stretch': lr = rr = 2.9; body.scale.y *= 1 + 0.05 * s(a * 4); break
      case 'shrug': lr = rr = 0.9; le = re = 1.3; break
      case 'salute': rr = 2.3; re = 1.6; break
      case 'dance': lr = 1.6 + s(t * 9) * 0.9; rr = 1.6 + s(t * 9 + 1.6) * 0.9; body.rotation.z += s(t * 7) * 0.12; body.position.y += Math.abs(s(t * 7)) * 0.1; break
      case 'fan': rr = 1.5; re = 1.1 + s(t * 14) * 0.22; break
      case 'confused': body.rotation.z += s(a * 3) * 0.1; rr = 2.2; re = 1.8; break
      case 'worried': lr = rr = 0.55; le = re = 1.7; break
      case 'blush': lr = rr = 0.55; le = re = 1.9; break
      case 'look': group.rotation.y += s(a * 1.3) * 0.45; break
      case 'held': lr = 2.5 + s(t * 8) * 0.22; rr = 2.5 - s(t * 8) * 0.22; kick = s(t * 12) * 0.5; break
      case 'sleep': lr = rr = 0.25; le = re = 1.4; body.rotation.z += 0.08; head.rotation.x = 0.18; break
      case 'present': rr = 1.75; re = 0.25; lr = 0.5; le = 0.9; break
      case 'point': rr = 1.55; re = 0.05; break
      case 'hang': lr = rr = 3.0; body.rotation.z += s(t * 3) * 0.18; kick = s(t * 7) * 0.5; break
      case 'peek': body.rotation.z += 0.22; rr = 2.0; re = 0.5 + s(a * 9) * 0.3; break
      case 'lift': lr = rr = 2.8; le = re = 0.3 + s(t * 6) * 0.2; body.scale.y *= 0.97; break
      case 'ride': rr = 2.5; re = 0.5 + s(t * 11) * 0.45; lr = 0.6; break
      case 'idle': break
    }
    // a raise turns each arm outward: the left arm one way, the right the other
    L.shoulder.rotation.set(swing, 0, -lr)
    R.shoulder.rotation.set(-swing, 0, rr)
    L.elbow.rotation.z = -le
    R.elbow.rotation.z = re
    feet[0].rotation.x = kick
    feet[1].rotation.x = -kick

    // props
    siren.visible = p.prop === 'siren'
    if (siren.visible) {
      const on = Math.floor(t * 6) % 2 === 0
      sirenBlue.color.set('#3b7bff').multiplyScalar(on ? 3.2 : 0.4)
      sirenRed.color.set('#ff3b47').multiplyScalar(on ? 0.4 : 3.2)
    }
    umbrella.visible = p.prop === 'umbrella'
    signStop.visible = p.prop === 'sign-stop'
    signGo.visible = p.prop === 'sign-go'
    fan.visible = p.prop === 'fan'
    if (fan.visible) fan.rotation.z = 0.5 * s(t * 12)
  }

  return { group, update, orbs, dispose: () => trash.forEach((x) => x.dispose()) }
}
