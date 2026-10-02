import type { Anim, Mood } from './types'

/** Sparky's face is a black glass screen; his glowing eyes carry every mood (design sheet). */
export const EXPRESSIONS = ['happy', 'excited', 'curious', 'thinking', 'surprised', 'sleepy', 'angry', 'peaceful', 'laughing'] as const
export type Expression = (typeof EXPRESSIONS)[number]

/** Which eyes a moment calls for: the animation first, else the mood. */
export function expressionFor(anim: Anim, mood: Mood): Expression {
  switch (anim) {
    case 'sleep':
    case 'yawn':
      return 'sleepy'
    case 'cheer':
    case 'backflip':
    case 'lift':
      return 'excited'
    case 'dance':
      return 'laughing'
    case 'held':
    case 'dizzy':
      return 'surprised'
    case 'look':
    case 'confused':
    case 'shrug':
    case 'peek':
      return 'curious'
    case 'worried':
    case 'fan':
      return 'thinking'
    case 'blush':
    case 'stretch':
      return 'peaceful'
    default:
      break
  }
  switch (mood) {
    case 'sleepy':
      return 'sleepy'
    case 'curious':
      return 'curious'
    case 'sad':
      return 'thinking'
    case 'disco':
      return 'laughing'
    default:
      return 'happy'
  }
}

export interface FaceState {
  expr: Expression
  /** -1..1, where the eyes look. */
  lookX: number
  lookY: number
  /** 0 open .. 1 shut (a blink). */
  blink: number
  /** Seconds — for the sleepy z's and the excited sparkles. */
  t: number
  /** Sunglasses (the max-speed dance). */
  shades: boolean
}

const GOLD = '#ff7448'
const HOT = '#ffd9c8'

/**
 * Draw the eyes onto a transparent canvas that is mapped across the face
 * screen. Strokes are glowing red-orange (Sparky's palette); the 3D bloom pass adds
 * the halo on top. Everything is sized from the canvas so it stays crisp
 * at any resolution.
 */
export function drawFace(ctx: CanvasRenderingContext2D, w: number, h: number, f: FaceState): void {
  ctx.clearRect(0, 0, w, h)
  const u = w / 100
  const lx = 50 - 17 + f.lookX * 3
  const rx = 50 + 17 + f.lookX * 3
  const cy = 52 + f.lookY * 4
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = GOLD
  ctx.fillStyle = GOLD
  ctx.shadowColor = '#ff2a10'
  ctx.shadowBlur = 5 * u
  const P = (x: number) => x * u
  const Y = (y: number) => (y * h) / 100

  const arc = (cx: number, up: boolean, r: number, width: number) => {
    ctx.lineWidth = width * u
    ctx.beginPath()
    if (up) ctx.arc(P(cx), Y(cy + r * 0.55), r * u, Math.PI * 1.13, Math.PI * 1.87)
    else ctx.arc(P(cx), Y(cy - r * 0.55), r * u, Math.PI * 0.13, Math.PI * 0.87)
    ctx.stroke()
  }
  const oval = (cx: number, ew: number, ry: number, fill: boolean, width = 2.6) => {
    ctx.lineWidth = width * u
    ctx.beginPath()
    ctx.ellipse(P(cx), Y(cy), ew * u, Math.max(0.35, ry * (1 - f.blink * 0.92)) * u, 0, 0, Math.PI * 2)
    if (fill) ctx.fill()
    else ctx.stroke()
  }
  const shine = (cx: number, ew: number) => {
    ctx.save()
    ctx.shadowBlur = 0
    ctx.fillStyle = HOT
    ctx.beginPath()
    ctx.arc(P(cx - ew * 0.35), Y(cy - 3), ew * 0.28 * u, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  if (f.shades) {
    // cool glasses: two dark lenses with a gold rim and a bridge
    ctx.lineWidth = 1.6 * u
    for (const cx of [lx, rx]) {
      ctx.beginPath()
      ctx.roundRect(P(cx - 11), Y(cy - 10), 22 * u, Y(20) - Y(0), 4 * u)
      ctx.fillStyle = '#120c04'
      ctx.fill()
      ctx.stroke()
      ctx.save()
      ctx.shadowBlur = 0
      ctx.strokeStyle = HOT
      ctx.lineWidth = 1 * u
      ctx.beginPath()
      ctx.moveTo(P(cx - 7), Y(cy - 5))
      ctx.lineTo(P(cx - 2), Y(cy - 8))
      ctx.stroke()
      ctx.restore()
    }
    ctx.beginPath()
    ctx.moveTo(P(lx + 11), Y(cy - 4))
    ctx.lineTo(P(rx - 11), Y(cy - 4))
    ctx.stroke()
    ctx.restore()
    return
  }

  switch (f.expr) {
    case 'happy':
      arc(lx, true, 9, 3.4)
      arc(rx, true, 9, 3.4)
      // the little smile from the hero image
      ctx.lineWidth = 2 * u
      ctx.beginPath()
      ctx.arc(P(50 + f.lookX * 3), Y(cy + 10), 5 * u, Math.PI * 0.18, Math.PI * 0.82)
      ctx.stroke()
      break
    case 'excited': {
      arc(lx, true, 10, 4.2)
      arc(rx, true, 10, 4.2)
      // two little sparkles that twinkle
      const tw = 0.6 + 0.4 * Math.sin(f.t * 8)
      ctx.lineWidth = 1.4 * u
      for (const [x, y] of [
        [lx - 14, cy - 18],
        [rx + 14, cy - 18],
      ]) {
        const s = 3.2 * tw
        ctx.beginPath()
        ctx.moveTo(P(x - s), Y(y))
        ctx.lineTo(P(x + s), Y(y))
        ctx.moveTo(P(x), Y(y - s * 1.6))
        ctx.lineTo(P(x), Y(y + s * 1.6))
        ctx.stroke()
      }
      break
    }
    case 'curious': {
      // the sheet's "C" eyes, and a question mark
      ctx.lineWidth = 3.2 * u
      for (const cx of [lx, rx]) {
        ctx.beginPath()
        ctx.arc(P(cx), Y(cy), 7.5 * u, Math.PI * 0.25, Math.PI * 1.85)
        ctx.stroke()
      }
      ctx.font = `700 ${9 * u}px Orbitron, Poppins, sans-serif`
      ctx.fillText('?', P(rx + 10), Y(cy - 16))
      break
    }
    case 'thinking':
      oval(lx, 6.8, 9.5, true)
      oval(rx, 5.2, 4.2, true)
      shine(lx, 6.8)
      break
    case 'surprised':
      oval(lx, 8, 11, false, 3)
      oval(rx, 8, 11, false, 3)
      oval(lx, 2.6, 3.6, true)
      oval(rx, 2.6, 3.6, true)
      break
    case 'sleepy': {
      // heavy half-closed lids: a flat line with a soft droop
      ctx.lineWidth = 3 * u
      for (const cx of [lx, rx]) {
        ctx.beginPath()
        ctx.moveTo(P(cx - 8), Y(cy + 1))
        ctx.quadraticCurveTo(P(cx), Y(cy + 6), P(cx + 8), Y(cy + 1))
        ctx.stroke()
      }
      // z z z drifting up
      ctx.font = `700 ${7 * u}px Orbitron, Poppins, sans-serif`
      ctx.shadowBlur = 3 * u
      for (let i = 0; i < 3; i++) {
        const k = (f.t * 0.35 + i / 3) % 1
        ctx.globalAlpha = Math.sin(k * Math.PI)
        const size = 4 + i * 1.6
        ctx.font = `700 ${size * u}px Orbitron, Poppins, sans-serif`
        ctx.fillText('z', P(rx + 10 + k * 8), Y(cy - 12 - k * 22))
      }
      ctx.globalAlpha = 1
      break
    }
    case 'angry':
      ctx.lineWidth = 3.4 * u
      ctx.beginPath()
      ctx.moveTo(P(lx - 9), Y(cy - 6))
      ctx.lineTo(P(lx + 8), Y(cy + 2))
      ctx.lineTo(P(lx - 7), Y(cy + 6))
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(P(rx + 9), Y(cy - 6))
      ctx.lineTo(P(rx - 8), Y(cy + 2))
      ctx.lineTo(P(rx + 7), Y(cy + 6))
      ctx.closePath()
      ctx.fill()
      break
    case 'peaceful':
      arc(lx, false, 8, 3)
      arc(rx, false, 8, 3)
      break
    case 'laughing':
      ctx.lineWidth = 3.6 * u
      ctx.beginPath()
      ctx.moveTo(P(lx - 7), Y(cy - 8))
      ctx.lineTo(P(lx + 5), Y(cy))
      ctx.lineTo(P(lx - 7), Y(cy + 8))
      ctx.moveTo(P(rx + 7), Y(cy - 8))
      ctx.lineTo(P(rx - 5), Y(cy))
      ctx.lineTo(P(rx + 7), Y(cy + 8))
      ctx.stroke()
      break
  }
  ctx.restore()
}
