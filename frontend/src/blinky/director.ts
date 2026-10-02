import { Brain, mulberry32, pick, pointOn, topPlatform, type Rng } from './brain'
import { makePath, type Frame, type Path } from './locomotion'
import { nearestPlatform, platformUnder } from './world'
import { presentLayout } from './explainLayout'
import { explainerFor, liveFactsFor, type Explainer } from './catalogue'
import { FACTS, GREETINGS, JOKES, liveLine } from './lines'
import { chirp, type Chirp } from './sound'
import { planPrank } from './pranks'
import { rideable, startRide, stepRide, type Ride } from './ride'
import { rideBus } from './rideBus'
import { restPose, type RigPose } from './model'
import type { Target } from './targets'
import type { WorldRead } from './worldDom'
import type { LiveState } from './useLiveState'
import type { Anim, Gait, Intent, Mood, PrankId, Prop, Vec, WorldSnapshot } from './types'

/** Zen's height at rest, hat to aura (Section 40: big, not Blinky's 44 px). */
export const REST_SIZE = 110
export type Align = 'left' | 'center' | 'right'

export interface Ui {
  setSize(px: number): void
  say(text: string, align: Align, ms: number): void
  openExplain(e: { explainer: Explainer; at: { left: number; top: number }; target: Target | null }): void
}

/** What BlinkyRoot hands the director every frame. */
export interface Ctx {
  /** Seconds. */
  now: number
  dt: number
  world: WorldRead
  live: LiveState
  route: string
  pointer: Vec | null
  idleSeconds: number
  /** prefs.asleep ("Shh"). */
  docked: boolean
  sound: boolean
  reducedMotion: boolean
  /** Where Blinky's feet go in the dock badge. */
  dock: Vec | null
}

type Step =
  | { t: 'move'; gait: Gait; to: Vec; platformId: string | null }
  | { t: 'say'; text: string; mood: Mood; ms: number; sound?: Chirp }
  | { t: 'pose'; anim: Anim; mood: Mood; ms: number; prop: Prop; sound?: Chirp }
  | { t: 'do'; fn: () => void }

interface Expr {
  anim: Anim
  mood: Mood
  prop: Prop
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const readTime = (text: string) => Math.min(7000, 1800 + 45 * text.length)

/**
 * Blinky's body: carries out the brain's intents as a queue of steps
 * (moves block until they land, poses block for their duration, lines
 * don't block), keeps it standing on — and scrolling with — its card,
 * runs pranks with their undo, rides vehicles, and handles taps, drags
 * and the antenna. No React: BlinkyRoot calls tick() every frame and
 * reads pos/size/hidden/clip/pose back.
 */
export class Director {
  readonly pose: RigPose = restPose()
  pos: Vec = { x: 320, y: window.innerHeight - 90 }
  size = REST_SIZE
  hidden = false
  clip: string | null = null

  private readonly rng: Rng = mulberry32((Date.now() & 0xffff) + 1)
  private readonly brain = new Brain(this.rng)
  private ctx: Ctx | null = null
  private path: Path | null = null
  private pathT0 = 0
  private pathPlatform: string | null = null
  private frame: Frame | null = null
  private anchor: { el: Element; dx: number; dy: number } | null = null
  private platformId: string | null = null
  private queue: Step[] = []
  private poseUntil = 0
  private expr: Expr | null = null
  private cleanup: (() => void) | null = null
  private ride: { r: Ride; from: Vec; t0: number } | null = null
  private held: { dx: number; dy: number } | null = null
  private down: { p: Vec; moved: boolean } | null = null
  private antenna = false
  private presenting: { faceX: number; component: boolean } | null = null
  private docked = false
  private greeted = false
  private seq = 0
  private lastBrain = 0
  private lastHover = -Infinity
  private lastDodge = -Infinity
  private lastPtr: { p: Vec; t: number } | null = null
  private deck: string[] = []
  private taps: number[] = []
  private tapTimer = 0

  constructor(private readonly ui: Ui) {}

  // ---------------------------------------------------------------- frame

  tick(ctx: Ctx): void {
    this.ctx = ctx
    const now = ctx.now
    if (!this.greeted) {
      if (ctx.docked || ctx.reducedMotion) this.greeted = true
      else if (ctx.world.platforms.length) {
        this.greeted = true
        const top = topPlatform(ctx.world.platforms)
        if (top) {
          this.queue.push(
            { t: 'move', gait: 'teleport', to: pointOn(top, this.rng), platformId: top.id },
            { t: 'say', text: pick(this.rng, GREETINGS), mood: 'happy', ms: 3200, sound: 'hi' },
            { t: 'pose', anim: 'wave', mood: 'happy', ms: 1400, prop: null },
          )
        }
      }
    }

    if (now - this.lastBrain >= 0.1) {
      this.lastBrain = now
      const seq = ctx.live.switchedSeq
      const snap: WorldSnapshot = {
        now,
        self: this.pos,
        platforms: ctx.world.platforms,
        pointer: ctx.pointer,
        idleSeconds: ctx.idleSeconds,
        route: ctx.route,
        run: ctx.live.run,
        scenario: ctx.live.scenario,
        switched: seq !== this.seq,
        emergency: ctx.live.emergency,
        queued: ctx.live.queued,
        docked: ctx.docked,
        reducedMotion: ctx.reducedMotion,
        twinPerch: ctx.world.twinPerch,
        rideable: ctx.live.run.running && rideable(),
      }
      this.seq = seq
      this.enqueue(this.brain.next(snap, this.busy(now)), now)
    }

    this.runQueue(now)
    this.frame = null
    if (this.ride) this.stepRide(now)
    else if (this.path) {
      const f = this.path.at(now - this.pathT0)
      this.pos = { x: f.x, y: f.y }
      this.frame = f
      if (now - this.pathT0 >= this.path.duration) this.arrive(this.pathPlatform)
    } else if (this.held) {
      // bodyMove() moves it
    } else if (this.docked) {
      if (ctx.dock) this.pos = { ...ctx.dock }
    } else {
      this.followAnchor()
      this.settle(now)
    }
    this.dodge(now)
    this.writePose(now, ctx.dt)
  }

  private busy(now: number): boolean {
    return this.queue.length > 0 || this.path !== null || now < this.poseUntil || this.ride !== null || this.held !== null || this.antenna || this.presenting !== null
  }

  private running(): boolean {
    return this.ctx?.live.run.running === true
  }

  /** The brain state to return to after a hold/explain/ride: docked stays docked. */
  private restState(): 'docked' | 'perched' | 'roaming' {
    return this.docked ? 'docked' : this.running() ? 'perched' : 'roaming'
  }

  private chirp(k: Chirp): void {
    chirp(k, this.ctx?.sound === true)
  }

  private setSize(px: number): void {
    if (px === this.size) return
    this.size = px
    this.ui.setSize(px)
  }

  private sayNow(text: string, ms = readTime(text)): void {
    const x = this.pos.x
    this.ui.say(text, x < 220 ? 'left' : x > window.innerWidth - 220 ? 'right' : 'center', ms)
  }

  // ---------------------------------------------------------------- steps

  private enqueue(intents: Intent[], now: number): void {
    for (const i of intents) {
      switch (i.kind) {
        case 'move':
          this.queue.push({ t: 'move', gait: i.gait, to: i.to, platformId: i.platformId })
          break
        case 'say':
          this.queue.push({ t: 'say', text: i.text, mood: i.mood, ms: i.ms })
          break
        case 'emote':
          this.queue.push({ t: 'pose', anim: i.anim, mood: i.mood, ms: i.ms, prop: i.prop, sound: i.anim === 'cheer' ? 'cheer' : undefined })
          break
        case 'prank':
          this.queue.push(...this.prankSteps(i.id))
          break
        case 'ride':
          this.beginRide(now)
          break
        case 'sleep':
          this.queue.push({ t: 'pose', anim: 'yawn', mood: 'sleepy', ms: 1500, prop: null, sound: 'yawn' }, { t: 'say', text: 'Zzz…', mood: 'sleepy', ms: 2500 })
          break
        case 'wake':
          this.docked = false
          this.queue.push({ t: 'pose', anim: 'stretch', mood: 'happy', ms: 900, prop: null })
          break
        case 'dock':
          this.interrupt()
          this.docked = true
          this.setSize(REST_SIZE)
          if (this.ctx?.dock) this.startMove('teleport', this.ctx.dock, null, now)
          break
      }
    }
  }

  private runQueue(now: number): void {
    while (this.queue.length && !this.path && now >= this.poseUntil && !this.held && !this.antenna) {
      const s = this.queue.shift()
      if (!s) break
      if (s.t === 'move') this.startMove(s.gait, s.to, s.platformId, now)
      else if (s.t === 'say') {
        this.sayNow(s.text, s.ms)
        if (s.sound) this.chirp(s.sound)
      } else if (s.t === 'pose') {
        this.expr = { anim: s.anim, mood: s.mood, prop: s.prop }
        this.poseUntil = now + s.ms / 1000
        if (s.sound) this.chirp(s.sound)
      } else s.fn()
    }
  }

  /** Drop whatever it's doing — undoing a prank and leaving a ride. */
  interrupt(): void {
    this.queue.length = 0
    this.path = null
    this.poseUntil = 0
    this.expr = null
    this.cleanup?.()
    this.cleanup = null
    this.clip = null
    if (this.ride) this.endRide(false, true)
  }

  private startMove(gait: Gait, to: Vec, platformId: string | null, now: number): void {
    this.anchor = null
    this.platformId = null
    if (gait === 'teleport') this.chirp('pop')
    if (Math.abs(to.x - this.pos.x) > 2) this.pose.facing = Math.sign(to.x - this.pos.x)
    if (this.ctx?.reducedMotion) {
      this.pos = { ...to }
      this.arrive(platformId)
      return
    }
    this.path = makePath(gait, { ...this.pos }, to, this.rng)
    this.pathT0 = now
    this.pathPlatform = platformId
  }

  private arrive(platformId: string | null): void {
    this.path = null
    if (!platformId || !this.ctx) return
    const el = this.ctx.world.elementOf.get(platformId)
    if (!el || !el.isConnected) return
    const r = el.getBoundingClientRect()
    // Feet on the platform's line: the card's top edge, or its title row.
    // The offset recorded with the platform, from the same read as its y —
    // not p.y minus a fresh rect, which bakes in any scroll since the read.
    const p = this.ctx.world.platforms.find((q) => q.id === platformId)
    const dy = this.ctx.world.offsetOf.get(platformId) ?? (p ? p.y - r.top : 0)
    this.anchor = { el, dx: this.pos.x - r.left, dy }
    this.platformId = platformId
    this.pos = { x: this.pos.x, y: r.top + dy }
  }

  /** Stand on the card it's anchored to, wherever the card has scrolled. */
  private followAnchor(): void {
    const a = this.anchor
    if (!a || !this.ctx) return
    if (!a.el.isConnected) {
      this.anchor = null
      return
    }
    const r = a.el.getBoundingClientRect()
    this.pos = { x: r.left + a.dx, y: r.top + a.dy }
    const m = this.ctx.world.main
    const off = this.pos.x < r.left || this.pos.x > r.right
    if (off || (m && (this.pos.y < m.top + 40 || this.pos.y > m.bottom - 4))) this.anchor = null
  }

  /** Not on anything: fall onto the card below, or pop over to the nearest one. */
  private settle(now: number): void {
    if (this.anchor || this.path || this.queue.length || !this.ctx) return
    if (this.presenting || this.antenna || this.held || this.ride || this.docked) return
    const w = this.ctx.world
    const m = w.main
    const inside = m !== null && this.pos.y > m.top + 40 && this.pos.y < m.bottom && this.pos.x > m.left && this.pos.x < m.right
    const under = inside ? platformUnder(w.platforms, this.pos) : null
    if (under && Math.abs(under.y - this.pos.y) <= 2) {
      this.arrive(under.id)
      return
    }
    if (under) {
      this.startMove('fall', { x: this.pos.x, y: under.y }, under.id, now)
      return
    }
    const near = nearestPlatform(w.platforms, this.pos)
    if (near) this.startMove('teleport', pointOn(near, this.rng), near.id, now)
  }

  private homeStep(gait: Gait = 'hop'): Step | null {
    const w = this.ctx?.world
    if (!w) return null
    const p = (this.running() ? w.twinPerch : null) ?? nearestPlatform(w.platforms, this.pos)
    return p ? { t: 'move', gait, to: pointOn(p, this.rng), platformId: p.id } : null
  }

  // ---------------------------------------------------------------- pranks

  private prankSteps(id: PrankId): Step[] {
    const plan = planPrank(id, this.rng)
    if (!plan) return [{ t: 'pose', anim: 'shrug', mood: 'happy', ms: 1000, prop: null }]
    const steps: Step[] = []
    if (plan.via) steps.push({ t: 'move', gait: plan.via.gait, to: plan.via.to, platformId: null })
    steps.push({ t: 'move', gait: plan.gait, to: plan.to, platformId: null })
    const undo = () => {
      this.clip = null
      plan.end?.()
    }
    steps.push({
      t: 'do',
      fn: () => {
        this.clip = plan.clip ?? null
        plan.start?.()
        this.cleanup = undo
      },
    })
    if (plan.say) steps.push({ t: 'say', text: plan.say, mood: 'happy', ms: 2000, sound: 'giggle' })
    if (plan.swap) {
      steps.push({ t: 'pose', anim: plan.anim, mood: 'happy', ms: plan.swap.atMs, prop: plan.prop })
      if (plan.swap.say) steps.push({ t: 'say', text: plan.swap.say, mood: 'happy', ms: 1600 })
      steps.push({ t: 'pose', anim: plan.anim, mood: 'happy', ms: plan.ms - plan.swap.atMs, prop: plan.swap.prop })
    } else steps.push({ t: 'pose', anim: plan.anim, mood: 'happy', ms: plan.ms, prop: plan.prop })
    steps.push({
      t: 'do',
      fn: () => {
        this.cleanup = null
        undo()
        const h = this.homeStep()
        if (h) this.queue.unshift(h)
      },
    })
    return steps
  }

  // ---------------------------------------------------------------- rides

  private beginRide(now: number): void {
    const r = startRide(now, this.rng)
    if (!r) {
      this.brain.set(this.running() ? 'perched' : 'roaming')
      return
    }
    this.anchor = null
    this.ride = { r, from: { ...this.pos }, t0: now }
    if (r.mode === '3d') {
      this.chirp('pop')
      this.hidden = true
      return
    }
    const b = r.el?.getBoundingClientRect()
    this.setSize(clamp(b ? Math.max(b.width, b.height) * 3 : 70, 56, 90))
    this.sayNow('Beep beep!', 1600)
  }

  private stepRide(now: number): void {
    const ride = this.ride
    if (!ride) return
    const s = stepRide(ride.r, now)
    if (s.done) {
      this.endRide(s.stuck, false)
      return
    }
    if (!s.pos) return
    const v = { x: s.pos.x, y: s.pos.y + 3 }
    const k = Math.min(1, (now - ride.t0) / 0.6)
    this.pos = k < 1 ? { x: lerp(ride.from.x, v.x, k), y: lerp(ride.from.y, v.y, k) - 360 * k * (1 - k) } : v
    if (k < 1) this.frame = { x: this.pos.x, y: this.pos.y, squash: 1, tilt: 0, scale: 1, air: true }
  }

  private endRide(stuck: boolean, silent: boolean): void {
    const ride = this.ride
    if (!ride) return
    this.ride = null
    if (ride.r.mode === '3d' && rideBus.vehicleId === ride.r.id) rideBus.vehicleId = null
    this.hidden = false
    this.setSize(REST_SIZE)
    this.brain.set(this.running() ? 'perched' : 'roaming')
    if (silent) return
    const h = this.homeStep(ride.r.mode === '3d' ? 'teleport' : 'hop')
    if (h) this.queue.push(h)
    if (stuck) this.queue.push({ t: 'say', text: 'This one’s stuck! Hopping off.', mood: 'curious', ms: 2200 })
    else this.queue.push({ t: 'pose', anim: 'wave', mood: 'happy', ms: 900, prop: null })
  }

  // ---------------------------------------------------------------- pose

  private expression(now: number): Expr {
    const f = this.frame
    if (this.held) return { anim: 'held', mood: 'curious', prop: null }
    if (this.antenna) return { anim: 'point', mood: 'curious', prop: null }
    if (f?.air) return { anim: 'air', mood: 'happy', prop: this.path?.gait === 'fly' ? 'propeller' : null }
    if (f && this.path?.gait === 'walk') return { anim: 'walk', mood: 'happy', prop: null }
    if (this.expr && now < this.poseUntil) return this.expr
    if (this.ride) return { anim: 'ride', mood: 'happy', prop: null }
    if (this.presenting) return { anim: this.presenting.component ? 'point' : 'present', mood: 'happy', prop: null }
    if (this.docked || this.brain.state === 'sleeping') return { anim: 'sleep', mood: 'sleepy', prop: null }
    return { anim: 'idle', mood: this.ctx?.live.emergency ? 'curious' : 'happy', prop: null }
  }

  private writePose(now: number, dt: number): void {
    const p = this.pose
    const f = this.frame
    p.t = now
    p.squash = f?.squash ?? 1
    p.tilt = f?.tilt ?? 0
    p.scale = f?.scale ?? 1
    p.air = f?.air ?? false
    const e = this.expression(now)
    if (e.anim !== p.anim) {
      p.anim = e.anim
      p.animT = 0
    } else p.animT += dt
    p.mood = e.mood
    p.prop = e.prop
    const ptr = this.ctx?.pointer
    if (ptr) {
      p.look.x = clamp((ptr.x - this.pos.x) / 300, -1, 1)
      p.look.y = clamp((ptr.y - (this.pos.y - this.size * 0.8)) / 300, -1, 1)
    }
    if (this.presenting && !f) p.facing = this.presenting.faceX
  }

  // ---------------------------------------------------------------- the pointer

  private dodge(now: number): void {
    const p = this.ctx?.pointer
    if (!p || !this.ctx) return
    const last = this.lastPtr
    this.lastPtr = { p: { ...p }, t: now }
    if (!last || now - last.t <= 0) return
    const speed = Math.hypot(p.x - last.p.x, p.y - last.p.y) / (now - last.t)
    if (speed < 2200 || now - this.lastDodge < 3 || this.busy(now) || this.docked || !this.anchor || this.brain.state === 'sleeping') return
    if (Math.hypot(p.x - this.pos.x, p.y - (this.pos.y - this.size / 2)) > 110) return
    const plat = this.ctx.world.platforms.find((q) => q.id === this.platformId)
    if (!plat) return
    this.lastDodge = now
    const x = clamp(this.pos.x + Math.sign(this.pos.x - p.x || 1) * 90, plat.x1, plat.x2)
    this.queue.push({ t: 'move', gait: 'hop', to: { x, y: plat.y }, platformId: plat.id }, { t: 'say', text: 'Whoa!', mood: 'curious', ms: 900 })
  }

  hover(now: number): void {
    if (now - this.lastHover < 6 || this.busy(now) || this.docked) return
    this.lastHover = now
    this.queue.push({ t: 'pose', anim: 'blush', mood: 'happy', ms: 900, prop: null, sound: 'giggle' })
  }

  bodyDown(p: Vec): void {
    this.down = { p, moved: false }
  }

  bodyMove(p: Vec): void {
    const d = this.down
    if (!d || this.docked || this.presenting) return
    if (!d.moved) {
      if (Math.hypot(p.x - d.p.x, p.y - d.p.y) < 6) return
      d.moved = true
      this.interrupt()
      this.anchor = null
      this.brain.set('held')
      this.held = { dx: this.pos.x - d.p.x, dy: this.pos.y - d.p.y }
    }
    if (this.held) this.pos = { x: p.x + this.held.dx, y: p.y + this.held.dy }
  }

  bodyUp(now: number): void {
    const d = this.down
    this.down = null
    if (!d) return
    if (d.moved) {
      this.held = null
      this.brain.set(this.running() ? 'perched' : 'roaming')
      this.sayNow('Wheee!', 1000)
      return
    }
    this.tap(now)
  }

  private tap(now: number): void {
    this.taps = this.taps.filter((t) => now - t < 1).concat(now)
    window.clearTimeout(this.tapTimer)
    if (this.presenting) {
      this.queue.push({ t: 'pose', anim: 'blush', mood: 'happy', ms: 700, prop: null })
      return
    }
    if (this.taps.length >= 3) {
      this.taps = []
      this.interrupt()
      this.queue.push({ t: 'pose', anim: 'dizzy', mood: 'curious', ms: 1800, prop: null }, { t: 'say', text: 'Too fast! Everything’s spinning…', mood: 'curious', ms: 2000 })
      return
    }
    this.tapTimer = window.setTimeout(() => {
      const n = this.taps.length
      this.taps = []
      if (this.docked) {
        this.sayNow('Zzz… press Wake to wake me.', 2200)
        return
      }
      this.interrupt()
      if (n === 2) this.queue.push({ t: 'pose', anim: 'backflip', mood: 'happy', ms: 900, prop: null, sound: 'boing' }, { t: 'say', text: 'Ta-da!', mood: 'happy', ms: 1200 })
      else this.react(0)
    }, 280)
  }

  /** A single tap: the next card from a shuffled deck of hi / fact / joke / live. */
  private react(depth: number): void {
    if (!this.deck.length) {
      const d = ['hi', 'fact', 'joke', 'live']
      for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1))
        ;[d[i], d[j]] = [d[j], d[i]]
      }
      this.deck = d
    }
    const k = this.deck.shift()
    if (k === 'live') {
      const l = this.ctx ? liveLine(liveFactsFor(this.ctx.live.facts, this.ctx.live.run.running)) : null
      if (!l) {
        if (depth < 4) this.react(depth + 1)
        return
      }
      this.queue.push({ t: 'say', text: l, mood: 'curious', ms: readTime(l) }, { t: 'pose', anim: 'look', mood: 'curious', ms: 1600, prop: null })
      return
    }
    const text = k === 'hi' ? 'Hi, I’m Zen. Drag one of my orbs onto anything and I’ll explain it.' : k === 'fact' ? pick(this.rng, FACTS) : pick(this.rng, JOKES)
    this.queue.push({ t: 'say', text, mood: 'happy', ms: readTime(text), sound: k === 'joke' ? 'giggle' : 'hi' }, { t: 'pose', anim: k === 'hi' ? 'wave' : 'blush', mood: 'happy', ms: 1400, prop: null })
  }

  // ---------------------------------------------------------------- the antenna guide

  getBall(): Vec {
    return { x: this.pos.x, y: this.pos.y - 0.94 * this.size }
  }

  /** An orb is in the user's hand (hidden from Zen's orbit) / back home. */
  holdOrb(i: number | null): void {
    this.pose.orbHeld = i
  }

  grabAntenna(): void {
    this.interrupt()
    this.antenna = true
    this.brain.set('held')
    this.chirp('pop')
  }

  dropAntenna(t: Target | null, now: number): void {
    this.antenna = false
    this.brain.set(this.restState())
    if (t && this.present(t, now)) return
    this.queue.push({ t: 'say', text: 'Hmm… nothing to explain there.', mood: 'curious', ms: 1800, sound: 'chime' }, { t: 'pose', anim: 'shrug', mood: 'curious', ms: 1200, prop: null })
  }

  /** Fly to the front and open the explainer. False when the id has no entry. */
  present(t: Target, now: number): boolean {
    const explainer = explainerFor(t.id)
    if (!explainer) return false
    this.interrupt()
    this.brain.set('presenting')
    const page = t.id.startsWith('page:')
    const r = page ? null : t.el.getBoundingClientRect()
    const l = presentLayout(r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, { w: window.innerWidth, h: window.innerHeight })
    // Shushed or reduced motion: explain from the dock (spec §2) — no flight.
    if (this.docked || this.ctx?.reducedMotion) {
      this.presenting = { faceX: l.card.left > this.pos.x ? 1 : -1, component: !page }
      this.ui.openExplain({ explainer, at: l.card, target: page ? null : t })
      this.chirp('tada')
      return true
    }
    this.setSize(l.size)
    this.presenting = { faceX: l.card.left > l.blinky.x ? 1 : -1, component: !page }
    this.startMove('fly', l.blinky, null, now)
    this.ui.openExplain({ explainer, at: l.card, target: page ? null : t })
    this.chirp('tada')
    return true
  }

  /** The explainer closed: shrink back and hop home (or back to the dock — the brain sees to that). */
  endPresent(): void {
    if (!this.presenting) return
    this.presenting = null
    this.path = null
    this.setSize(REST_SIZE)
    this.brain.set(this.restState())
    if (this.docked) return
    const h = this.homeStep()
    if (h) this.queue.push(h)
    this.queue.push({ t: 'pose', anim: 'wave', mood: 'happy', ms: 800, prop: null })
  }

  comeHere(): void {
    if (this.docked || !this.ctx) return
    const m = this.ctx.world.main
    const goal = m ? { x: (m.left + m.right) / 2, y: m.top + 160 } : this.pos
    const p = nearestPlatform(this.ctx.world.platforms, goal)
    if (!p) return
    this.interrupt()
    this.brain.set(this.running() ? 'perched' : 'roaming')
    this.queue.push(
      { t: 'move', gait: 'fly', to: pointOn(p, this.rng), platformId: p.id },
      { t: 'say', text: 'Here I am!', mood: 'happy', ms: 1600, sound: 'hi' },
      { t: 'pose', anim: 'wave', mood: 'happy', ms: 1200, prop: null },
    )
  }
}
