import { useEffect, useRef } from 'react'

/**
 * A little moving picture of what a scenario puts on the road, for its
 * card: cars arriving at the scenario's own demand level, queueing at a
 * red and flowing on a green (the two axes swap every 4 s), one arm
 * busier on the approach-heavy cards, a stalled truck under a hazard sign
 * on Accident, a flashing emergency vehicle on Emergency, rain on Rain,
 * and the ramping demand curve on Rush hour.
 *
 * Illustration, not data: it is a toy loop that says "this is the kind of
 * traffic this card means" at a glance, drawn in the plan view's daytime
 * palette so the cards read as small versions of the same map. Nothing on
 * it is claimed to be the real scenario's numbers. Still under reduced
 * motion (one frame), and it only runs while the card is on screen.
 */

type Arm = 'N' | 'S' | 'E' | 'W'
const ARMS: Arm[] = ['N', 'S', 'E', 'W']

interface Params {
  /** Arrivals per hour per arm, the prototype's scale (≈ 0–1300). */
  rate: number
  heavy?: Arm
  ramp?: boolean
  rain?: boolean
  accident?: boolean
  emergency?: boolean
}

const PARAMS: Record<string, Params> = {
  light_seed1: { rate: 227 },
  balanced_seed1: { rate: 471 },
  normal_traffic_seed1: { rate: 700 },
  heavy_seed1: { rate: 964 },
  extreme_seed1: { rate: 1334 },
  rush_hour_seed1: { rate: 600, ramp: true },
  north_heavy_seed1: { rate: 320, heavy: 'N' },
  south_heavy_seed1: { rate: 320, heavy: 'S' },
  east_heavy_seed1: { rate: 320, heavy: 'E' },
  west_heavy_seed1: { rate: 320, heavy: 'W' },
  accident_seed1: { rate: 800, accident: true },
  emergency_response_seed1: { rate: 560, emergency: true },
  rain_seed1: { rate: 560, rain: true },
}

/** Rush hour's shape: up, a peak, then easing (0–700 → arrivals/h). */
function rampAt(t: number): number {
  const x = t / 700
  return 250 + 1000 * Math.exp(-Math.pow((x - 0.5) / 0.2, 2))
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GROUND = '#C9DDB4'
const ROAD = '#8C929A'
const WALK = '#E7E5DE'
const ROOF = ['#ECE6DA', '#E4DCCB', '#F1EEE7', '#DDD6C8']
const LEAF = ['#7FB069', '#6FA35B', '#8CBB73']

export function ScenarioPreview({ id, seed }: { id: string; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const S = PARAMS[id] ?? { rate: 471 }
    const r = rng(31 + seed * 977)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let cars: { a: Arm; u: number }[] = []
    let t = seed * 1.7
    let last = performance.now()
    let raf = 0
    let visible = true

    // Fixed scenery per card: a few blocks and trees in the four corners.
    const scenery = { blocks: [] as number[][], trees: [] as number[][] }
    for (let q = 0; q < 4; q++) {
      for (let k = 0; k < 3; k++) scenery.blocks.push([q, r(), r(), 0.18 + r() * 0.2, 0.25 + r() * 0.25, Math.floor(r() * ROOF.length)])
      for (let k = 0; k < 3; k++) scenery.trees.push([q, r(), r(), Math.floor(r() * LEAF.length)])
    }

    const draw = (dt: number) => {
      const b = cv.getBoundingClientRect()
      if (!b.width) return
      const d = Math.min(2, devicePixelRatio || 1)
      if (cv.width !== Math.round(b.width * d)) {
        cv.width = Math.round(b.width * d)
        cv.height = Math.round(b.height * d)
      }
      const g = cv.getContext('2d')
      if (!g) return
      g.setTransform(d, 0, 0, d, 0, 0)
      const W = b.width
      const H = b.height
      const cx = W / 2
      const cy = H / 2
      t += dt

      g.fillStyle = GROUND
      g.fillRect(0, 0, W, H)
      // corners: blocks and trees, clear of the roads and sidewalks
      const qx = (q: number) => (q % 2 === 0 ? [4, cx - 20] : [cx + 20, W - 4])
      const qy = (q: number) => (q < 2 ? [4, cy - 20] : [cy + 20, H - 4])
      for (const [q, u, v, w, h, c] of scenery.blocks) {
        const [x0, x1] = qx(q)
        const [y0, y1] = qy(q)
        const bw = (x1 - x0) * w
        const bh = (y1 - y0) * h
        const x = x0 + u * (x1 - x0 - bw)
        const y = y0 + v * (y1 - y0 - bh)
        g.fillStyle = 'rgba(40,52,32,.14)'
        g.fillRect(x + 1.5, y + 2, bw, bh)
        g.fillStyle = ROOF[c]
        g.fillRect(x, y, bw, bh)
      }
      for (const [q, u, v, c] of scenery.trees) {
        const [x0, x1] = qx(q)
        const [y0, y1] = qy(q)
        g.fillStyle = LEAF[c]
        g.beginPath()
        g.arc(x0 + 4 + u * (x1 - x0 - 8), y0 + 4 + v * (y1 - y0 - 8), 3.2, 0, 6.283)
        g.fill()
      }
      // sidewalks, roads, dashes
      g.fillStyle = WALK
      g.fillRect(0, cy - 16, W, 32)
      g.fillRect(cx - 16, 0, 32, H)
      g.fillStyle = ROAD
      g.fillRect(0, cy - 12, W, 24)
      g.fillRect(cx - 12, 0, 24, H)
      g.strokeStyle = 'rgba(232,185,35,.9)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(0, cy)
      g.lineTo(cx - 13, cy)
      g.moveTo(cx + 13, cy)
      g.lineTo(W, cy)
      g.moveTo(cx, 0)
      g.lineTo(cx, cy - 13)
      g.moveTo(cx, cy + 13)
      g.lineTo(cx, H)
      g.stroke()

      const ns = Math.floor(t / 4) % 2 === 0
      const blocked = !!S.accident && Math.floor(t / 10) % 2 === 0
      const len = (a: Arm) => (a === 'N' || a === 'S' ? cy - 14 : cx - 14)
      const rate = (a: Arm) => {
        let v = S.rate
        if (S.heavy) v = a === S.heavy ? 1270 : S.rate
        if (S.ramp) v = rampAt((t * 14) % 700)
        return v / 1300
      }
      for (const a of ARMS) if (r() < rate(a) * dt * 2.4) cars.push({ a, u: 0 })
      for (const a of ARMS) {
        const q = cars.filter((x) => x.a === a).sort((x, y) => y.u - x.u)
        const green = a === 'N' || a === 'S' ? ns : !ns
        const gap = 9 / len(a)
        const sp = S.rain ? 0.2 : 0.3
        let lead = 9
        for (const car of q) {
          let cap = lead - gap
          if (car.u < 1 && !green) cap = Math.min(cap, 1 - 0.02)
          if (blocked && a === 'E' && car.u < 0.47) cap = Math.min(cap, 0.47 - gap)
          car.u = Math.max(car.u, Math.min(car.u + sp * dt, cap))
          lead = car.u
        }
      }
      cars = cars.filter((x) => x.u < 2.25)
      const pos = (a: Arm, u: number): [number, number] => {
        const L = len(a) + 10
        const o = 5
        // Inbound sides as on junction C: N east of centre, S west, W north, E south.
        return a === 'N' ? [cx + o, -10 + u * L] : a === 'S' ? [cx - o, H + 10 - u * L] : a === 'E' ? [W + 10 - u * L, cy + o] : [-10 + u * L, cy - o]
      }
      for (const car of cars) {
        const [x, y] = pos(car.a, car.u)
        const green = car.a === 'N' || car.a === 'S' ? ns : !ns
        const red = car.u < 1 && (!green || (blocked && car.a === 'E' && car.u < 0.47))
        g.fillStyle = red ? '#E11D48' : '#F7F9FC'
        g.strokeStyle = 'rgba(15,25,48,.55)'
        g.lineWidth = 0.8
        g.beginPath()
        const vert = car.a === 'N' || car.a === 'S'
        g.roundRect(x - (vert ? 2 : 3.5), y - (vert ? 3.5 : 2), vert ? 4 : 7, vert ? 7 : 4, 1.2)
        g.fill()
        g.stroke()
      }
      const lamp = (x: number, y: number, on: boolean) => {
        g.fillStyle = '#0A0E16'
        g.beginPath()
        g.arc(x, y, 3.6, 0, 6.283)
        g.fill()
        g.fillStyle = on ? '#2AF28E' : '#FF3B47'
        g.beginPath()
        g.arc(x, y, 2.2, 0, 6.283)
        g.fill()
      }
      lamp(cx - 17, cy - 17, ns)
      lamp(cx + 17, cy + 17, ns)
      lamp(cx + 17, cy - 17, !ns)
      lamp(cx - 17, cy + 17, !ns)
      if (S.emergency) {
        const f = Math.floor(t * 6) % 2
        const [x, y] = pos('W', (t * 0.2) % 2.1)
        g.fillStyle = f ? 'rgba(255,42,42,.45)' : 'rgba(42,109,255,.45)'
        g.beginPath()
        g.arc(x, y, 11, 0, 6.283)
        g.fill()
        g.fillStyle = '#fff'
        g.strokeStyle = '#E11D48'
        g.lineWidth = 1
        g.beginPath()
        g.roundRect(x - 4, y - 2.2, 8, 4.4, 1.2)
        g.fill()
        g.stroke()
      }
      if (blocked) {
        const [x, y] = pos('E', 0.47)
        g.fillStyle = '#4d734d'
        g.fillRect(x - 7, y - 3, 14, 6)
        g.save()
        g.translate(x, y - 15)
        g.beginPath()
        g.moveTo(0, -7)
        g.lineTo(7.5, 5.5)
        g.lineTo(-7.5, 5.5)
        g.closePath()
        g.fillStyle = '#FFC21A'
        g.fill()
        g.lineWidth = 1.6
        g.strokeStyle = '#0A0A0A'
        g.stroke()
        g.fillStyle = '#0A0A0A'
        g.fillRect(-0.8, -3.6, 1.6, 5)
        g.restore()
      }
      if (S.rain) {
        g.strokeStyle = 'rgba(60,82,106,.45)'
        g.lineWidth = 1
        g.beginPath()
        for (let k = 0; k < 44; k++) {
          const x = ((k * 53.7 + t * 60) % (W + 20)) - 10
          const y = ((k * 31.3 + t * 260) % (H + 20)) - 10
          g.moveTo(x, y)
          g.lineTo(x - 2, y - 9)
        }
        g.stroke()
      }
      if (S.ramp) {
        g.fillStyle = 'rgba(255,255,255,.85)'
        g.beginPath()
        g.roundRect(6, H - 52, 104, 44, 8)
        g.fill()
        g.strokeStyle = '#2F6BFF'
        g.lineWidth = 1.5
        g.beginPath()
        for (let k = 0; k <= 60; k++) {
          const x = 12 + k * 1.5
          const y = H - 12 - (rampAt((k / 60) * 700) / 1250) * 34
          if (k) g.lineTo(x, y)
          else g.moveTo(x, y)
        }
        g.stroke()
        const k = (((t * 14) % 700) / 700) * 60
        g.fillStyle = '#2F6BFF'
        g.beginPath()
        g.arc(12 + k * 1.5, H - 12 - (rampAt((k / 60) * 700) / 1250) * 34, 3, 0, 6.283)
        g.fill()
      }
    }

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (visible) draw(dt)
      raf = requestAnimationFrame(loop)
    }
    if (reduced) {
      // One settled frame: let the queues form, then draw once.
      for (let i = 0; i < 60; i++) draw(0.1)
      return
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
    })
    io.observe(cv)
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [id, seed])

  return <canvas ref={ref} aria-hidden className="block h-[104px] w-full" />
}
