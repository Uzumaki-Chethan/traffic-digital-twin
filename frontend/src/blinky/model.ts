import * as THREE from 'three'
import type { Anim, Mood, Prop } from './types'
import { drawFace, expressionFor } from './face'
import { coreTexture, faceCanvas, glowTexture, scarfTexture } from './sparkyTextures'

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
  /** The antenna the user is pulling (its tip glows hot), or null. */
  antennaHeld: number | null
}

export function restPose(): RigPose {
  return { mood: 'happy', anim: 'idle', animT: 0, squash: 1, tilt: 0, facing: 1, look: { x: 0, y: 0 }, prop: null, scale: 1, t: 0, air: false, antennaHeld: null }
}

const MOOD_HEX: Record<Exclude<Mood, 'disco'>, string> = { happy: '#ff6a3c', curious: '#ff8a3a', sad: '#ff4a3a', sleepy: '#b8402a' }
const DISCO = ['#ff3b47', '#ffb020', '#2af28e']

/** The eye glow colour for the 2D fallback. */
export function moodColour(m: Mood, t: number): string {
  return m === 'disco' ? DISCO[Math.floor(t * 6) % 3] : MOOD_HEX[m]
}

/** Sparky's two antenna tips — the drag-to-explain handles (BlinkyRoot puts hit areas on them). */
export const HANDLE_COUNT = 2

export interface Rig {
  group: THREE.Group
  update(p: RigPose, dt: number): void
  dispose(): void
  /** The antenna tips, for projecting their screen positions. */
  handles: THREE.Object3D[]
}

function signTexture(text: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 320
  const g = c.getContext('2d')
  if (!g) throw new Error('2D canvas unavailable')
  g.fillStyle = '#2a2a2a'
  g.fillRect(0, 0, 512, 320)
  g.fillStyle = bg
  g.fillRect(24, 24, 464, 272)
  g.strokeStyle = '#ffffff'
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

/**
 * Sparky in 3D (Section 41), from the owner's design sheet: a glossy white
 * ceramic robot with a big black glass face and glowing red-orange eyes,
 * two antennas topped with glowing red balls (the drag handles), red-ringed
 * ear pods, a red scarf, a glowing red triangle chest core, black joints,
 * and leg thrusters that fire orange flames when he flies. He hovers.
 *
 * Units: feet near y = 0.15, antenna tips near y = 2.6 — the same canvas
 * geometry contract as before.
 */
export function buildSparky(env: THREE.Texture | null = null): Rig {
  const trash: { dispose(): void }[] = []
  const keep = <T extends { dispose(): void }>(x: T): T => {
    trash.push(x)
    return x
  }
  const s = Math.sin

  // ---------------------------------------------------------------- materials
  const ceramic = keep(new THREE.MeshPhysicalMaterial({ color: '#f3f1ee', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, envMap: env, envMapIntensity: 0.8 }))
  const matteBlack = keep(new THREE.MeshPhysicalMaterial({ color: '#141416', roughness: 0.45, metalness: 0.3, clearcoat: 0.4, envMap: env, envMapIntensity: 0.6 }))
  const glossRed = keep(new THREE.MeshPhysicalMaterial({ color: '#e0201a', roughness: 0.18, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new THREE.Color('#5a0400'), envMap: env, envMapIntensity: 0.9 }))
  const metalGrey = keep(new THREE.MeshPhysicalMaterial({ color: '#8a8d92', roughness: 0.3, metalness: 1, envMap: env, envMapIntensity: 1.2 }))
  const screenMat = keep(new THREE.MeshPhysicalMaterial({ color: '#010101', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.18, envMap: env, envMapIntensity: 0.12 }))
  const scarfTex = keep(scarfTexture())
  const scarfMat = keep(new THREE.MeshPhysicalMaterial({ map: scarfTex, roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color('#ff3a1c'), sheenRoughness: 0.4, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.3 }))
  const glowTex = keep(glowTexture())
  const glowSprite = (r: number, g: number, b: number) =>
    keep(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(r, g, b), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  const emissive = (r: number, g: number, b: number) => keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false }))

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    keep(geo)
    return new THREE.Mesh(geo, mat)
  }
  const ring = (r: number, tube: number, mat: THREE.Material) => {
    const m = mesh(new THREE.TorusGeometry(r, tube, 16, 96), mat)
    m.rotation.x = Math.PI / 2
    return m
  }

  const group = new THREE.Group()
  const inner = new THREE.Group()
  inner.scale.setScalar(0.9)
  group.add(inner)
  const body = new THREE.Group()
  inner.add(body)

  // ---------------------------------------------------------------- torso
  const chest = mesh(new THREE.SphereGeometry(0.4, 96, 64), ceramic)
  chest.scale.set(1.05, 1.1, 0.92)
  chest.position.y = 0.88
  const waist = ring(0.27, 0.055, matteBlack)
  waist.position.y = 0.6
  const waistTrim = ring(0.3, 0.012, glossRed)
  waistTrim.position.y = 0.66
  const pelvis = mesh(new THREE.SphereGeometry(0.3, 64, 48), ceramic)
  pelvis.scale.set(1.05, 0.62, 0.9)
  pelvis.position.y = 0.5
  const neck = mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.14, 48), matteBlack)
  neck.position.y = 1.3
  body.add(chest, waist, waistTrim, pelvis, neck)
  // red seam lines curving down the chest
  for (const side of [-1, 1]) {
    const seam = mesh(new THREE.TorusGeometry(0.42, 0.008, 8, 96, 1.1), glossRed)
    seam.position.set(side * 0.02, 0.88, 0)
    seam.rotation.set(0, side * 0.55, -Math.PI / 2 - 0.55)
    body.add(seam)
  }
  // chest core: a black triangular plate carrying the glowing red triangle
  const core = new THREE.Group()
  core.position.set(0, 0.9, 0.36)
  core.rotation.x = -0.12
  const plate = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 3, 1), matteBlack)
  plate.rotation.set(Math.PI / 2, 0, 0) // a corner pointing down, like the sheet
  const coreTex = keep(coreTexture())
  const coreMat = keep(new THREE.MeshBasicMaterial({ map: coreTex, color: new THREE.Color(2.6, 1.0, 0.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  const coreFace = mesh(new THREE.PlaneGeometry(0.28, 0.28), coreMat)
  coreFace.position.z = 0.025
  core.add(plate, coreFace)
  body.add(core)

  // ---------------------------------------------------------------- legs and thrusters
  type Leg = { hip: THREE.Group; knee: THREE.Group; flame: THREE.Mesh; flameMat: THREE.ShaderMaterial; nozzle: THREE.MeshBasicMaterial; light: THREE.Sprite }
  const flameShader = () =>
    keep(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
        uniforms: { k: { value: 1 }, t: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        // uv.y 1 at the nozzle, 0 at the tip: white-hot core, orange body, red fade
        fragmentShader:
          'uniform float k; uniform float t; varying vec2 vUv; void main(){ float y = vUv.y; float flick = 0.85 + 0.15 * sin(t * 40.0 + vUv.x * 20.0); vec3 hot = vec3(3.0, 2.6, 1.8); vec3 mid = vec3(2.6, 0.9, 0.2); vec3 cold = vec3(1.2, 0.15, 0.05); vec3 c = mix(cold, mid, smoothstep(0.0, 0.6, y)); c = mix(c, hot, smoothstep(0.75, 1.0, y)); float a = smoothstep(0.0, 0.5, y) * k * flick; gl_FragColor = vec4(c * a, a); }',
      }),
    )
  const makeLeg = (side: number): Leg => {
    const hip = new THREE.Group()
    hip.position.set(side * 0.17, 0.46, 0)
    const hipJoint = mesh(new THREE.SphereGeometry(0.09, 40, 28), matteBlack)
    const thigh = mesh(new THREE.CapsuleGeometry(0.095, 0.1, 8, 32), ceramic)
    thigh.position.y = -0.11
    const knee = new THREE.Group()
    knee.position.y = -0.24
    const kneeJoint = mesh(new THREE.SphereGeometry(0.085, 40, 28), matteBlack)
    // the chunky boot: white shell, black band, red ring, thruster nozzle
    const boot = mesh(new THREE.CylinderGeometry(0.125, 0.15, 0.22, 48), ceramic)
    boot.position.y = -0.14
    const band = mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.05, 48), matteBlack)
    band.position.y = -0.2
    const red = ring(0.128, 0.012, glossRed)
    red.position.y = -0.04
    const nozzle = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 48, 1, true), matteBlack)
    nozzle.position.y = -0.29
    const nozzleMat = emissive(2.8, 0.9, 0.3)
    const glowDisc = mesh(new THREE.CircleGeometry(0.085, 32), nozzleMat)
    glowDisc.rotation.x = Math.PI / 2
    glowDisc.position.y = -0.31
    const flameMat = flameShader()
    // a cone hanging from the nozzle, tip down (ConeGeometry's uv.y is 1 at
    // the tip, so flipping it puts uv.y = 1 at the nozzle, as the shader wants)
    const flameGeo = new THREE.ConeGeometry(0.085, 0.7, 32, 1, true)
    flameGeo.rotateX(Math.PI)
    flameGeo.translate(0, -0.35, 0)
    const flame = mesh(flameGeo, flameMat)
    flame.position.y = -0.33
    const light = new THREE.Sprite(glowSprite(1.6, 0.5, 0.2))
    light.position.y = -0.36
    light.scale.setScalar(0.5)
    knee.add(kneeJoint, boot, band, red, nozzle, glowDisc, flame, light)
    hip.add(hipJoint, thigh, knee)
    body.add(hip)
    return { hip, knee, flame, flameMat, nozzle: nozzleMat, light }
  }
  const legs = [makeLeg(-1), makeLeg(1)]

  // ---------------------------------------------------------------- arms
  type Arm = { shoulder: THREE.Group; elbow: THREE.Group }
  const makeArm = (side: number): Arm => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.44, 1.02, 0)
    const pad = mesh(new THREE.SphereGeometry(0.14, 48, 32), ceramic)
    const padRing = ring(0.12, 0.014, glossRed)
    padRing.position.y = -0.06
    const joint = mesh(new THREE.SphereGeometry(0.075, 32, 24), matteBlack)
    joint.position.y = -0.13
    const upper = mesh(new THREE.CapsuleGeometry(0.075, 0.08, 8, 24), ceramic)
    upper.position.y = -0.2
    const elbow = new THREE.Group()
    elbow.position.y = -0.3
    const elbowJoint = mesh(new THREE.SphereGeometry(0.065, 32, 24), matteBlack)
    const fore = mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 32), ceramic)
    fore.position.y = -0.1
    const cuff = ring(0.084, 0.012, matteBlack)
    cuff.position.y = -0.17
    const hand = new THREE.Group()
    hand.position.y = -0.24
    const palm = mesh(new THREE.SphereGeometry(0.07, 40, 28), matteBlack)
    palm.scale.set(1, 0.95, 0.75)
    hand.add(palm)
    for (let k = 0; k < 3; k++) {
      const fng = mesh(new THREE.CapsuleGeometry(0.02, 0.045, 6, 12), matteBlack)
      fng.position.set((k - 1) * 0.034, -0.075, 0.01)
      const tip = mesh(new THREE.SphereGeometry(0.021, 16, 12), ceramic)
      tip.position.y = -0.035
      fng.add(tip)
      hand.add(fng)
    }
    const thumb = mesh(new THREE.CapsuleGeometry(0.02, 0.035, 6, 12), matteBlack)
    thumb.position.set(-side * 0.06, -0.03, 0.03)
    thumb.rotation.z = side * 0.9
    hand.add(thumb)
    elbow.add(elbowJoint, fore, cuff, hand)
    shoulder.add(pad, padRing, joint, upper, elbow)
    body.add(shoulder)
    return { shoulder, elbow }
  }
  const L = makeArm(-1)
  const R = makeArm(1)

  // ---------------------------------------------------------------- scarf
  const scarfWrap = mesh(new THREE.TorusGeometry(0.25, 0.09, 32, 128), scarfMat)
  scarfWrap.rotation.x = Math.PI / 2
  scarfWrap.position.y = 1.3
  scarfWrap.scale.set(1.05, 1, 0.85)
  body.add(scarfWrap)
  type Ribbon = { c: { geo: THREE.BufferGeometry; pos: THREE.BufferAttribute; base: Float32Array }; phase: number; lift: number }
  const tails: Ribbon[] = []
  // two tails streaming out to the sides and back, as on the sheet
  for (const [x, y, z, ry, rz, w, len, phase, lift] of [
    [-0.24, 1.3, -0.06, -0.5, -1.0, 0.22, 1.2, 0, 0.3],
    [0.24, 1.28, -0.08, 0.5, 0.9, 0.19, 1.0, 1.9, 0.25],
  ] as const) {
    const geo = new THREE.PlaneGeometry(w, len, 1, 48)
    geo.translate(0, -len / 2, 0)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const m = mesh(geo, scarfMat)
    m.position.set(x, y, z)
    m.rotation.set(0, ry, rz)
    body.add(m)
    tails.push({ c: { geo, pos, base: Float32Array.from(pos.array as Float32Array) }, phase, lift })
  }

  // ---------------------------------------------------------------- head
  const head = new THREE.Group()
  head.position.y = 1.9
  body.add(head)
  const skull = mesh(new THREE.SphereGeometry(0.64, 128, 96), ceramic)
  skull.scale.set(1.04, 0.95, 0.98)
  head.add(skull)
  // red seam over the top, front to back, and a small vent slot
  // the arc starts just above the visor (0.78 rad above the front) and
  // runs over the crown to the back of the head
  const crest = mesh(new THREE.TorusGeometry(0.615, 0.022, 16, 160, 2.55), glossRed)
  crest.rotation.set(0, -Math.PI / 2, 0.78)
  crest.scale.copy(skull.scale)
  head.add(crest)
  const vent = mesh(new THREE.BoxGeometry(0.16, 0.035, 0.06), matteBlack)
  vent.position.set(0, 0.6, 0.12)
  vent.rotation.x = -0.25
  head.add(vent)
  // the face: a big black glass visor in a thin dark rim; eyes on a second cap
  const capArgs = [128, 64, Math.PI / 2 - 0.92, 1.84, Math.PI / 2 - 0.62, 1.2] as const
  const rim = mesh(new THREE.SphereGeometry(0.642, 128, 64, Math.PI / 2 - 0.97, 1.94, Math.PI / 2 - 0.67, 1.3), matteBlack)
  rim.scale.copy(skull.scale)
  head.add(rim)
  const screen = mesh(new THREE.SphereGeometry(0.652, ...capArgs), screenMat)
  screen.scale.copy(skull.scale)
  head.add(screen)
  const face = faceCanvas()
  keep(face.texture)
  const eyesMat = keep(new THREE.MeshBasicMaterial({ map: face.texture, color: new THREE.Color(2.7, 1.25, 0.85), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  const eyes = mesh(new THREE.SphereGeometry(0.657, ...capArgs), eyesMat)
  eyes.scale.copy(skull.scale)
  head.add(eyes)

  // ear pods: white shell, red ring, glowing concentric lens
  for (const side of [-1, 1]) {
    const pod = new THREE.Group()
    pod.position.set(side * 0.66, -0.02, 0)
    pod.rotation.z = (side * Math.PI) / 2
    const shell = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 64), ceramic)
    const redRing = mesh(new THREE.TorusGeometry(0.2, 0.04, 24, 96), glossRed)
    redRing.rotation.x = Math.PI / 2
    // the pod is turned so local -y points away from the head on both sides
    redRing.position.y = -0.07
    const lensOuter = mesh(new THREE.RingGeometry(0.1, 0.14, 64), emissive(2.6, 0.5, 0.3))
    lensOuter.rotation.x = Math.PI / 2
    lensOuter.position.y = -0.074
    const lensInner = mesh(new THREE.CircleGeometry(0.05, 48), emissive(2.8, 0.7, 0.4))
    lensInner.rotation.x = Math.PI / 2
    lensInner.position.y = -0.075
    pod.add(shell, redRing, lensOuter, lensInner)
    head.add(pod)
  }

  // antennas on top: black stalks with a metal joint, glowing red ball tips
  const antennas: THREE.Group[] = []
  const tipMats: THREE.MeshBasicMaterial[] = []
  const tipGlows: THREE.Sprite[] = []
  const handles: THREE.Object3D[] = []
  for (const side of [-1, 1]) {
    const ant = new THREE.Group()
    ant.position.set(side * 0.34, 0.48, -0.04)
    const base = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 32), matteBlack)
    const stalk = mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.42, 16), matteBlack)
    stalk.position.y = 0.22
    const joint = ring(0.024, 0.01, metalGrey)
    joint.position.y = 0.2
    const tipMat = emissive(2.6, 0.35, 0.25)
    tipMats.push(tipMat)
    const tip = mesh(new THREE.SphereGeometry(0.085, 48, 32), tipMat)
    tip.position.y = 0.48
    const shine = mesh(new THREE.SphereGeometry(0.022, 16, 12), emissive(3, 2.6, 2.4))
    shine.position.set(-0.03, 0.03, 0.06)
    tip.add(shine)
    const glow = new THREE.Sprite(glowSprite(1.4, 0.35, 0.2))
    glow.scale.setScalar(0.45)
    glow.position.y = 0.48
    tipGlows.push(glow)
    ant.add(base, stalk, joint, tip, glow)
    head.add(ant)
    antennas.push(ant)
    handles.push(tip)
  }

  // a soft red hover glow under him
  const hoverMat = glowSprite(1.2, 0.3, 0.15)
  const hoverGlow = new THREE.Sprite(hoverMat)
  hoverGlow.scale.set(1.3, 0.45, 1)
  hoverGlow.position.y = 0.05
  inner.add(hoverGlow)

  // sparks shed by the thrusters while flying
  const SPARKS = 70
  const sparkSeed = Array.from({ length: SPARKS }, () => [Math.random() < 0.5 ? -1 : 1, Math.random(), 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3] as const)
  const sparkGeo = keep(new THREE.BufferGeometry())
  const sparkPos = new Float32Array(SPARKS * 3)
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
  const sparkMat = keep(new THREE.PointsMaterial({ map: glowTex, size: 0.06, color: new THREE.Color(2.8, 1.1, 0.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  const sparks = new THREE.Points(sparkGeo, sparkMat)
  inner.add(sparks)

  // ---------------------------------------------------------------- props
  const props = new THREE.Group()
  body.add(props)
  const sirenBlue = emissive(0.7, 1.4, 3.2)
  const sirenRed = emissive(3.2, 0.4, 0.4)
  const siren = new THREE.Group()
  siren.position.set(0, 2.42, 0)
  for (const [x, m] of [
    [-0.09, sirenBlue],
    [0.09, sirenRed],
  ] as const) {
    const b = mesh(new THREE.SphereGeometry(0.07, 32, 24), m)
    b.position.x = x
    siren.add(b)
  }
  props.add(siren)
  const umbrella = new THREE.Group()
  umbrella.position.set(0.52, 1.0, 0)
  const canopyMat = keep(new THREE.MeshPhysicalMaterial({ color: '#d42a20', roughness: 0.4, clearcoat: 0.6, side: THREE.DoubleSide, envMap: env }))
  const canopy = mesh(new THREE.ConeGeometry(0.95, 0.34, 24, 1, true), canopyMat)
  canopy.position.y = 1.75
  const shaft = mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.75, 12), metalGrey)
  shaft.position.y = 0.88
  umbrella.add(canopy, shaft)
  props.add(umbrella)
  const makeSign = (text: string, bg: string) => {
    const g = new THREE.Group()
    const t = keep(signTexture(text, bg))
    const board = mesh(new THREE.BoxGeometry(0.62, 0.39, 0.03), keep(new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.4, envMap: env })))
    board.position.y = 0.62
    const stick = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 12), metalGrey)
    stick.position.y = 0.2
    g.add(board, stick)
    g.position.set(0.66, 0.55, 0.18)
    props.add(g)
    return g
  }
  const signStop = makeSign('STOP', '#c62828')
  const signGo = makeSign('GO', '#2e7d32')
  const fanMat = keep(new THREE.MeshPhysicalMaterial({ color: '#ff8a3a', roughness: 0.5, side: THREE.DoubleSide, envMap: env }))
  const fan = mesh(new THREE.CircleGeometry(0.26, 32, 0, Math.PI), fanMat)
  fan.position.set(0.66, 0.65, 0.25)
  props.add(fan)

  // ---------------------------------------------------------------- animation
  let blinkTimer = 2.5
  let blinking = 0
  let spin = 0
  let faceKey = ''

  function update(p: RigPose, dt: number) {
    const t = p.t
    const a = p.animT
    const asleep = p.anim === 'sleep'
    const flying = p.air
    const moving = flying || p.anim === 'walk' || p.anim === 'held'

    // hover on his thrusters, bobbing gently
    const hover = p.anim === 'ride' ? 0.0 : 0.16
    const bob = (asleep ? 0.02 : 0.05) * s(t * 1.8)
    const breathe = asleep ? 0.02 * s(t * 1.4) : 0.01 * s(t * 2.4)
    const sq = p.squash
    body.position.set(0, hover + bob, 0)
    body.scale.set(1 / Math.sqrt(sq), sq + breathe, 1 / Math.sqrt(sq))
    body.rotation.set(flying ? -0.18 : 0, 0, THREE.MathUtils.degToRad(-p.tilt))
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, p.facing * 0.38 + p.look.x * 0.14, Math.min(1, dt * 6))
    group.scale.setScalar(p.scale)
    head.rotation.set(-p.look.y * 0.12, p.look.x * 0.1, 0)

    // face: eyes (and a smile when happy), blinking, looking, dizzy spirals
    blinkTimer -= dt
    if (blinkTimer <= 0) {
      blinking = 0.15
      blinkTimer = 2.2 + Math.random() * 3.6
    }
    blinking = Math.max(0, blinking - dt)
    const blink = blinking > 0 ? Math.sin((blinking / 0.15) * Math.PI) : 0
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
    eyesMat.color.setRGB(2.7, 1.25, 0.85).multiplyScalar(asleep ? 0.5 : 1)

    // the chest core pulses; antenna tips glow (hot while being pulled)
    coreMat.color.setRGB(2.6, 1.0, 0.7).multiplyScalar(0.75 + 0.4 * (0.5 + 0.5 * s(t * 2.2)))
    tipMats.forEach((m, i) => {
      const held = p.antennaHeld === i
      m.color.setRGB(2.6, 0.35, 0.25).multiplyScalar(held ? 1.8 : 0.85 + 0.35 * (0.5 + 0.5 * s(t * 3 + i * 1.7)))
      tipGlows[i].scale.setScalar(held ? 0.75 : 0.45)
    })
    antennas.forEach((ant, i) => {
      const side = i === 0 ? -1 : 1
      const wob = (moving ? 0.18 : 0.06) * s(t * (moving ? 10 : 2.8) + i * 1.3)
      const pulled = p.antennaHeld === i ? 0.25 * side : 0
      ant.rotation.z = -side * 0.22 + wob + pulled - p.tilt * 0.004
      ant.rotation.x = 0.06 * s(t * 2 + i) - (flying ? 0.25 : 0)
    })

    // thrusters: a small hover flame always, a long roaring one in flight
    const thrust = p.anim === 'ride' || asleep ? 0.25 : flying ? 1 : p.anim === 'cheer' || p.anim === 'backflip' ? 0.8 : 0.4
    legs.forEach((leg, i) => {
      const flick = 0.9 + 0.1 * s(t * 37 + i * 2) + 0.06 * s(t * 23 + i)
      leg.flame.scale.set(0.8 + thrust * 0.4, Math.max(0.05, thrust * flick), 0.8 + thrust * 0.4)
      leg.flameMat.uniforms.k.value = 0.6 + thrust * 0.6
      leg.flameMat.uniforms.t.value = t
      leg.nozzle.color.setRGB(2.8, 0.9, 0.3).multiplyScalar(0.6 + thrust * 0.6)
      leg.light.scale.setScalar(0.35 + thrust * 0.45)
    })
    hoverMat.opacity = asleep ? 0.4 : p.anim === 'ride' ? 0 : 0.8

    // scarf tails stream behind, harder in flight
    tails.forEach(({ c, phase, lift }) => {
      const b = c.base
      const arr = c.pos.array as Float32Array
      const gust = flying ? 2.4 : moving ? 1.6 : 1
      for (let i = 0; i < b.length; i += 3) {
        const k = Math.min(1, -b[i + 1] / 1.25)
        arr[i] = b[i] + k * 0.14 * gust * s(t * 3 - k * 4.5 + phase)
        arr[i + 1] = b[i + 1] + k * k * (lift + (flying ? 0.5 : 0))
        arr[i + 2] = b[i + 2] + k * 0.07 * s(t * 2 - k * 3 + phase)
      }
      c.pos.needsUpdate = true
      c.geo.computeVertexNormals()
    })

    // sparks fall from the nozzles while he flies
    sparks.visible = thrust > 0.5
    for (let i = 0; i < SPARKS; i++) {
      const [side, off, sp, dx] = sparkSeed[i]
      const h = (t * sp + off) % 1
      sparkPos[i * 3] = side * 0.17 + dx * h
      sparkPos[i * 3 + 1] = body.position.y - 0.05 - h * 1.1
      sparkPos[i * 3 + 2] = (flying ? 0.35 : 0.05) * h
    }
    sparkGeo.getAttribute('position').needsUpdate = true

    // arms: "raise" angles (0 = hanging, ~2.9 = straight up), elbows bend
    let lr = 0.25
    let rr = 0.25
    let le = 0.3
    let re = 0.3
    let swing = s(t * 1.6) * 0.05
    let hipL = 0.12
    let hipR = 0.12
    let kneeBend = -0.25
    switch (p.anim) {
      case 'walk': swing = s(t * 7) * 0.4; hipL = 0.12 + s(t * 7) * 0.4; hipR = 0.12 - s(t * 7) * 0.4; break
      case 'air': lr = 1.2; rr = 1.5; le = 0.4; re = 0.1; hipL = 0.7; hipR = 0.25; kneeBend = -0.9; break
      case 'wave': rr = 2.6; re = 0.6 + s(a * 12) * 0.45; break
      case 'cheer': lr = rr = 2.7 + s(a * 16) * 0.15; body.position.y += Math.abs(s(a * 9)) * 0.22; break
      case 'dizzy': body.rotation.z += s(a * 8) * 0.16; lr = rr = 0.7; break
      case 'backflip': {
        const k = Math.min(1, a / 0.9)
        body.position.y += s(k * Math.PI) * 0.85
        body.rotation.x = -k * Math.PI * 2
        lr = rr = 2.3
        hipL = hipR = 0.9
        kneeBend = -1.4
        break
      }
      case 'yawn': lr = rr = 2.9; le = re = 0.5; break
      case 'stretch': lr = rr = 2.9; body.scale.y *= 1 + 0.05 * s(a * 4); break
      case 'shrug': lr = rr = 0.9; le = re = 1.3; break
      case 'salute': rr = 2.3; re = 1.6; break
      case 'dance': lr = 1.6 + s(t * 9) * 0.9; rr = 1.6 + s(t * 9 + 1.6) * 0.9; body.rotation.z += s(t * 7) * 0.12; body.position.y += Math.abs(s(t * 7)) * 0.1; hipL = 0.12 + s(t * 9) * 0.5; hipR = 0.12 - s(t * 9) * 0.5; break
      case 'fan': rr = 1.5; re = 1.1 + s(t * 14) * 0.22; break
      case 'confused': body.rotation.z += s(a * 3) * 0.1; rr = 2.2; re = 1.8; break
      case 'worried': lr = rr = 0.55; le = re = 1.7; break
      case 'blush': lr = rr = 0.55; le = re = 1.9; break
      case 'look': group.rotation.y += s(a * 1.3) * 0.45; break
      case 'held': lr = 2.5 + s(t * 8) * 0.22; rr = 2.5 - s(t * 8) * 0.22; hipL = 0.4 + s(t * 12) * 0.5; hipR = 0.4 - s(t * 12) * 0.5; break
      case 'sleep': lr = rr = 0.2; le = re = 1.3; body.rotation.z += 0.08; head.rotation.x = 0.2; kneeBend = -0.6; break
      case 'present': rr = 1.75; re = 0.25; lr = 0.5; le = 0.9; break
      case 'point': rr = 1.55; re = 0.05; break
      case 'hang': lr = rr = 3.0; body.rotation.z += s(t * 3) * 0.18; hipL = s(t * 7) * 0.5; hipR = -s(t * 7) * 0.5; break
      case 'peek': body.rotation.z += 0.22; rr = 2.0; re = 0.5 + s(a * 9) * 0.3; break
      case 'lift': lr = rr = 2.8; le = re = 0.3 + s(t * 6) * 0.2; body.scale.y *= 0.97; break
      case 'ride': rr = 2.5; re = 0.5 + s(t * 11) * 0.45; lr = 0.6; hipL = hipR = 1.3; kneeBend = -1.4; break
      case 'idle': break
    }
    L.shoulder.rotation.set(swing, 0, -lr)
    R.shoulder.rotation.set(-swing, 0, rr)
    L.elbow.rotation.z = -le
    R.elbow.rotation.z = re
    legs[0].hip.rotation.x = -hipL
    legs[1].hip.rotation.x = -hipR
    legs[0].knee.rotation.x = -kneeBend
    legs[1].knee.rotation.x = -kneeBend

    // props
    siren.visible = p.prop === 'siren'
    if (siren.visible) {
      const on = Math.floor(t * 6) % 2 === 0
      sirenBlue.color.setRGB(0.7, 1.4, 3.2).multiplyScalar(on ? 1 : 0.15)
      sirenRed.color.setRGB(3.2, 0.4, 0.4).multiplyScalar(on ? 0.15 : 1)
    }
    umbrella.visible = p.prop === 'umbrella'
    signStop.visible = p.prop === 'sign-stop'
    signGo.visible = p.prop === 'sign-go'
    fan.visible = p.prop === 'fan'
    if (fan.visible) fan.rotation.z = 0.5 * s(t * 12)
  }

  return { group, update, handles, dispose: () => trash.forEach((x) => x.dispose()) }
}
