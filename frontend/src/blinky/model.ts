import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Anim, Mood, Prop } from './types'

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
}

export function restPose(): RigPose {
  return { mood: 'happy', anim: 'idle', animT: 0, squash: 1, tilt: 0, facing: 1, look: { x: 0, y: 0 }, prop: null, scale: 1, t: 0, air: false }
}

const MOOD_HEX: Record<Exclude<Mood, 'disco'>, string> = { happy: '#2af28e', curious: '#ffb020', sad: '#ff3b47', sleepy: '#ff5a5f' }
const DISCO = ['#ff3b47', '#ffb020', '#2af28e']

export function moodColour(m: Mood, t: number): string {
  return m === 'disco' ? DISCO[Math.floor(t * 6) % 3] : MOOD_HEX[m]
}

export interface Rig {
  group: THREE.Group
  update(p: RigPose, dt: number): void
  dispose(): void
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function signTexture(text: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = bg
  g.beginPath()
  g.arc(64, 64, 62, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 6
  g.strokeStyle = '#ffffff'
  g.stroke()
  g.fillStyle = '#ffffff'
  g.font = 'bold 40px Poppins, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 64, 68)
  return new THREE.CanvasTexture(c)
}

/**
 * Blinky in 3D: a glossy charcoal signal housing on a chrome bezel, its
 * three lamps the face (eyes in the top lamp, mouth in the middle, belly
 * glow at the bottom), noodle arms, stubby feet, a springy antenna whose
 * ball is the drag handle, and props that pop in. Fake bloom: additive
 * radial-gradient sprites behind every light (real post-processing would
 * lose the canvas's transparency). Procedural — `update` poses it from a
 * RigPose every frame; nothing is baked.
 */
export function buildBlinky(env: THREE.Texture | null = null): Rig {
  const trash: { dispose(): void }[] = []
  const own = <T extends { dispose(): void }>(x: T): T => {
    trash.push(x)
    return x
  }
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)

  const shell = own(new THREE.MeshPhysicalMaterial({ color: '#1c2433', roughness: 0.32, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, envMap: env, envMapIntensity: 1 }))
  const chrome = own(new THREE.MeshStandardMaterial({ color: '#d5dde8', roughness: 0.18, metalness: 1, envMap: env, envMapIntensity: 1.2 }))
  const ink = own(new THREE.MeshStandardMaterial({ color: '#0a0d14', roughness: 0.5 }))
  const eyeWhite = own(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, emissive: '#ffffff', emissiveIntensity: 0.25 }))
  const pink = own(new THREE.MeshBasicMaterial({ color: '#ff7aa8', transparent: true, opacity: 0 }))
  const glowTex = own(glowTexture())
  const halo = (hex: string, size: number) => {
    const s = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })))
    s.scale.setScalar(size)
    return s
  }

  // housing (feet at y = 0, legs to 0.3, housing 0.3 … 1.85)
  const housing = new THREE.Mesh(own(new RoundedBoxGeometry(1, 1.55, 0.78, 5, 0.3)), shell)
  housing.position.y = 1.075
  body.add(housing)
  const bezel = new THREE.Mesh(own(new RoundedBoxGeometry(1.08, 1.63, 0.6, 5, 0.32)), chrome)
  bezel.position.set(0, 1.075, -0.12)
  body.add(bezel)

  // three lamps
  const lamps = [
    { y: 1.5, r: 0.27 },
    { y: 1.06, r: 0.2 },
    { y: 0.66, r: 0.16 },
  ].map(({ y, r }) => {
    const mat = own(new THREE.MeshStandardMaterial({ color: '#2af28e', emissive: '#2af28e', emissiveIntensity: 1.4, roughness: 0.25 }))
    const disc = new THREE.Mesh(own(new THREE.CircleGeometry(r, 40)), mat)
    disc.position.set(0, y, 0.395)
    const visor = new THREE.Mesh(own(new THREE.BoxGeometry(r * 2.3, 0.05, 0.2)), ink)
    visor.position.set(0, y + r + 0.03, 0.47)
    const h = halo('#2af28e', r * 4.2)
    h.position.set(0, y, 0.42)
    body.add(disc, visor, h)
    return { mat, halo: h }
  })

  // eyes in the top lamp
  const eyeGeo = own(new THREE.SphereGeometry(0.075, 20, 16))
  const pupilGeo = own(new THREE.SphereGeometry(0.038, 16, 12))
  const eyes = [-0.1, 0.1].map((x) => {
    const g = new THREE.Group()
    g.position.set(x, 1.53, 0.43)
    const pupil = new THREE.Mesh(pupilGeo, ink)
    pupil.position.z = 0.055
    g.add(new THREE.Mesh(eyeGeo, eyeWhite), pupil)
    body.add(g)
    return { g, pupil }
  })

  // mouth in the middle lamp: a smile arc, or a round "o"
  const smile = new THREE.Mesh(own(new THREE.TorusGeometry(0.085, 0.02, 8, 24, Math.PI)), ink)
  smile.position.set(0, 1.09, 0.41)
  smile.rotation.z = Math.PI
  const oMouth = new THREE.Mesh(own(new THREE.TorusGeometry(0.045, 0.018, 8, 20)), ink)
  oMouth.position.set(0, 1.05, 0.41)
  body.add(smile, oMouth)

  // blush
  const cheekGeo = own(new THREE.CircleGeometry(0.05, 16))
  for (const x of [-0.21, 0.21]) {
    const c = new THREE.Mesh(cheekGeo, pink)
    c.position.set(x, 1.42, 0.402)
    body.add(c)
  }

  // legs + feet (outside `body`, so squash doesn't shrink them)
  const legGeo = own(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10))
  const footGeo = own(new RoundedBoxGeometry(0.26, 0.13, 0.34, 3, 0.06))
  const feet = [-0.22, 0.22].map((x) => {
    const g = new THREE.Group()
    g.position.set(x, 0.3, 0)
    const leg = new THREE.Mesh(legGeo, chrome)
    leg.position.y = -0.11
    const foot = new THREE.Mesh(footGeo, shell)
    foot.position.set(0, -0.235, 0.05)
    g.add(leg, foot)
    group.add(g)
    return g
  })

  // arms: shoulder -> upper -> elbow -> fore + hand
  const upperGeo = own(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10))
  const foreGeo = own(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 10))
  const handGeo = own(new THREE.SphereGeometry(0.065, 14, 10))
  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.52, 1.28, 0)
    const upper = new THREE.Mesh(upperGeo, chrome)
    upper.position.y = -0.15
    const elbow = new THREE.Group()
    elbow.position.y = -0.3
    const fore = new THREE.Mesh(foreGeo, chrome)
    fore.position.y = -0.13
    const hand = new THREE.Mesh(handGeo, shell)
    hand.position.y = -0.28
    elbow.add(fore, hand)
    shoulder.add(upper, elbow)
    body.add(shoulder)
    return { shoulder, elbow, hand, side }
  })

  // antenna (its ball is the drag handle; BlinkyRoot puts the hit area there)
  const antenna = new THREE.Group()
  antenna.position.set(0, 1.85, 0)
  const stalk = new THREE.Mesh(own(new THREE.CylinderGeometry(0.022, 0.03, 0.5, 8)), chrome)
  stalk.position.y = 0.25
  const ballMat = own(new THREE.MeshStandardMaterial({ color: '#ffb020', emissive: '#ffb020', emissiveIntensity: 1.6 }))
  const ball = new THREE.Mesh(own(new THREE.SphereGeometry(0.09, 20, 16)), ballMat)
  ball.position.y = 0.57
  const ballHalo = halo('#ffb020', 0.5)
  ballHalo.position.y = 0.57
  antenna.add(stalk, ball, ballHalo)
  body.add(antenna)

  // props
  const propeller = new THREE.Group()
  propeller.position.set(0, 1.93, 0)
  const bladeGeo = own(new RoundedBoxGeometry(0.9, 0.03, 0.14, 2, 0.015))
  const bladeMat = own(new THREE.MeshStandardMaterial({ color: '#ffb020', roughness: 0.4 }))
  const blade = new THREE.Mesh(bladeGeo, bladeMat)
  const blade2 = new THREE.Mesh(bladeGeo, bladeMat)
  blade2.rotation.y = Math.PI / 2
  propeller.add(blade, blade2)
  body.add(propeller)

  const siren = new THREE.Group()
  siren.position.set(0, 1.92, 0.1)
  const sirenGeo = own(new RoundedBoxGeometry(0.22, 0.12, 0.16, 2, 0.04))
  const sirenBlue = own(new THREE.MeshStandardMaterial({ color: '#2f6bff', emissive: '#2f6bff', emissiveIntensity: 2 }))
  const sirenRed = own(new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff2a2a', emissiveIntensity: 2 }))
  const sb = new THREE.Mesh(sirenGeo, sirenBlue)
  sb.position.x = -0.13
  const sr = new THREE.Mesh(sirenGeo, sirenRed)
  sr.position.x = 0.13
  siren.add(sb, sr)
  body.add(siren)

  const rightHand = arms[1].hand
  const umbrella = new THREE.Group()
  const canopy = new THREE.Mesh(own(new THREE.ConeGeometry(0.62, 0.32, 18, 1, true)), own(new THREE.MeshStandardMaterial({ color: '#ff3b47', side: THREE.DoubleSide, roughness: 0.5 })))
  canopy.position.y = 0.95
  const pole = new THREE.Mesh(own(new THREE.CylinderGeometry(0.015, 0.015, 0.95, 6)), chrome)
  pole.position.y = 0.47
  umbrella.add(canopy, pole)
  rightHand.add(umbrella)

  const makeSign = (text: string, bg: string) => {
    const g = new THREE.Group()
    const face = new THREE.Mesh(own(new THREE.CircleGeometry(0.26, 32)), own(new THREE.MeshBasicMaterial({ map: own(signTexture(text, bg)) })))
    face.position.set(0, 0.72, 0.02)
    const stick = new THREE.Mesh(own(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6)), chrome)
    stick.position.y = 0.25
    g.add(face, stick)
    rightHand.add(g)
    return g
  }
  const signStop = makeSign('STOP', '#e11d48')
  const signGo = makeSign('GO', '#12b76a')

  const fan = new THREE.Mesh(own(new THREE.CircleGeometry(0.22, 24)), own(new THREE.MeshStandardMaterial({ color: '#86a6d6', side: THREE.DoubleSide })))
  fan.position.y = 0.2
  rightHand.add(fan)

  const shades = new THREE.Mesh(own(new RoundedBoxGeometry(0.42, 0.11, 0.06, 2, 0.03)), own(new THREE.MeshStandardMaterial({ color: '#05070a', roughness: 0.1, metalness: 0.6 })))
  shades.position.set(0, 1.535, 0.5)
  body.add(shades)

  let blinkTimer = 2 + Math.random() * 3
  let blinking = 0
  let spin = 0
  const col = new THREE.Color()
  const [L, R] = arms

  function update(p: RigPose, dt: number): void {
    const t = p.t
    const a = p.animT
    const s = Math.sin

    // mood -> lamps, halos
    col.set(moodColour(p.mood, t))
    const asleep = p.anim === 'sleep'
    lamps.forEach((l, i) => {
      l.mat.color.copy(col)
      l.mat.emissive.copy(col)
      l.mat.emissiveIntensity = (asleep ? 0.35 : [1.5, 0.9, 1.2][i]) * (0.9 + 0.1 * s(t * 3 + i))
      const hm = l.halo.material as THREE.SpriteMaterial
      hm.color.copy(col)
      hm.opacity = asleep ? 0.25 : 0.75
    })
    ballMat.emissiveIntensity = s(t * 4) > 0.6 ? 2.4 : 1.1

    // whole body: squash (volume kept), lean, facing, scale, breathing
    const breathe = asleep ? 0.03 * s(t * 1.6) : 0.015 * s(t * 2.4)
    const sq = p.squash
    body.scale.set(1 / Math.sqrt(sq), sq + breathe, 1 / Math.sqrt(sq))
    body.position.y = 0
    body.rotation.set(0, 0, THREE.MathUtils.degToRad(-p.tilt))
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, p.facing * 0.42 + p.look.x * 0.15, Math.min(1, dt * 8))
    group.scale.setScalar(p.scale)

    // eyes: blink, look, dizzy
    blinkTimer -= dt
    if (blinkTimer <= 0) {
      blinking = 0.13
      blinkTimer = 2 + Math.random() * 4
    }
    blinking -= dt
    const closed = asleep || blinking > 0
    spin += dt * 14
    eyes.forEach(({ g, pupil }, i) => {
      g.scale.y = closed ? 0.12 : 1
      if (p.anim === 'dizzy') {
        pupil.position.x = Math.cos(spin + i * Math.PI) * 0.03
        pupil.position.y = s(spin + i * Math.PI) * 0.03
      } else {
        pupil.position.x = THREE.MathUtils.clamp(p.look.x, -1, 1) * 0.03
        pupil.position.y = THREE.MathUtils.clamp(-p.look.y, -1, 1) * 0.025
      }
    })

    // mouth
    const round = p.anim === 'yawn' || p.anim === 'confused' || p.anim === 'held' || p.anim === 'dizzy'
    const frown = p.mood === 'sad' || p.anim === 'worried'
    smile.visible = !round
    oMouth.visible = round
    smile.rotation.z = frown ? 0 : Math.PI
    smile.position.y = frown ? 1.03 : 1.09
    pink.opacity = p.anim === 'blush' ? 0.85 : 0

    // arms: "raise" angles (0 = hanging, ~2.9 = straight up), elbows bend
    let lr = 0.18
    let rr = 0.18
    let le = 0
    let re = 0
    let swing = s(t * 1.7) * 0.06
    let kick = 0
    switch (p.anim) {
      case 'walk': swing = s(t * 12) * 0.6; kick = s(t * 12) * 0.5; break
      case 'air': lr = rr = 1.1; le = re = 0.4; break
      case 'wave': rr = 2.6; re = 0.6 + s(a * 14) * 0.5; break
      case 'cheer': lr = rr = 2.7 + s(a * 18) * 0.15; body.position.y = Math.abs(s(a * 10)) * 0.25; break
      case 'dizzy': body.rotation.z += s(a * 9) * 0.18; lr = rr = 0.6; break
      case 'backflip': {
        const k = Math.min(1, a / 0.9)
        body.position.y = s(k * Math.PI) * 0.9
        body.rotation.x = -k * Math.PI * 2
        lr = rr = 2.4
        break
      }
      case 'yawn': lr = rr = 2.9; le = re = 0.5; break
      case 'stretch': lr = rr = 2.9; body.scale.y *= 1 + 0.06 * s(a * 4); break
      case 'shrug': lr = rr = 0.9; le = re = 1.2; break
      case 'salute': rr = 2.3; re = 1.6; break
      case 'dance': lr = 1.6 + s(t * 10) * 0.9; rr = 1.6 + s(t * 10 + 1.6) * 0.9; body.rotation.z += s(t * 8) * 0.12; body.position.y = Math.abs(s(t * 8)) * 0.12; break
      case 'fan': rr = 1.4; re = 1.1 + s(t * 16) * 0.25; break
      case 'confused': body.rotation.z += s(a * 3) * 0.12; rr = 2.2; re = 1.8; break
      case 'worried': lr = rr = 0.5; le = re = 1.6; break
      case 'blush': lr = rr = 0.5; le = re = 1.9; break
      case 'look': group.rotation.y += s(a * 1.4) * 0.5; break
      case 'held': lr = 2.6 + s(t * 9) * 0.25; rr = 2.6 - s(t * 9) * 0.25; kick = s(t * 14) * 0.7; break
      case 'sleep': lr = rr = 0.1; body.rotation.z += 0.15; break
      case 'present': rr = 1.7; re = 0.2; lr = 0.35; break
      case 'point': rr = 1.5; break
      case 'hang': lr = rr = 3.0; body.rotation.z += s(t * 3) * 0.2; kick = s(t * 8) * 0.6; break
      case 'peek': body.rotation.z += 0.25; rr = 2.0; re = 0.5 + s(a * 10) * 0.3; break
      case 'lift': lr = rr = 2.8; le = re = 0.3 + s(t * 6) * 0.2; body.scale.y *= 0.96; break
      case 'ride': rr = 2.5; re = 0.5 + s(t * 12) * 0.5; lr = 0.6; break
      case 'idle': break
    }
    // a raise turns each arm outward: the left arm the other way to the right
    L.shoulder.rotation.set(swing, 0, -lr)
    R.shoulder.rotation.set(-swing, 0, rr)
    L.elbow.rotation.z = -le
    R.elbow.rotation.z = re
    feet[0].rotation.x = kick
    feet[1].rotation.x = -kick

    // antenna sway
    antenna.rotation.z = s(t * 2.2) * 0.08 - p.tilt * 0.004

    // props
    propeller.visible = p.prop === 'propeller'
    if (propeller.visible) propeller.rotation.y += dt * 30
    siren.visible = p.prop === 'siren'
    if (siren.visible) {
      const on = Math.floor(t * 6) % 2 === 0
      sirenBlue.emissiveIntensity = on ? 3 : 0.3
      sirenRed.emissiveIntensity = on ? 0.3 : 3
    }
    umbrella.visible = p.prop === 'umbrella'
    signStop.visible = p.prop === 'sign-stop'
    signGo.visible = p.prop === 'sign-go'
    fan.visible = p.prop === 'fan'
    if (fan.visible) fan.rotation.z += dt * 25
    shades.visible = p.prop === 'shades'
  }

  return { group, update, dispose: () => trash.forEach((x) => x.dispose()) }
}
