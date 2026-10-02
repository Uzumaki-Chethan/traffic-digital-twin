import * as THREE from 'three'

/**
 * Sparky's painted detail (design sheet, Section 41): the face canvas, a
 * soft glow, the red silk scarf and the glowing triangle chest core. All
 * procedural — no image files.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [c, ctx]
}

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 16
  t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}

/** The red silk scarf: a warm red-to-orange sheen with fine silk streaks. */
export function scarfTexture(): THREE.CanvasTexture {
  const W = 512
  const H = 2048
  const [c, ctx] = canvas(W, H)
  const g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0, '#b0120c')
  g.addColorStop(0.5, '#ff3a1c')
  g.addColorStop(1, '#c4180e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // silk streaks and a warmer tip
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(255,140,60,0.12)' : 'rgba(90,0,0,0.12)'
    ctx.lineWidth = 1 + Math.random() * 3
    const x = Math.random() * W
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.bezierCurveTo(x + 30, H * 0.3, x - 30, H * 0.6, x + 10, H)
    ctx.stroke()
  }
  const tip = ctx.createLinearGradient(0, H * 0.6, 0, H)
  tip.addColorStop(0, 'rgba(255,120,30,0)')
  tip.addColorStop(1, 'rgba(255,120,30,0.45)')
  ctx.fillStyle = tip
  ctx.fillRect(0, H * 0.6, W, H * 0.4)
  return tex(c)
}

/** A rounded triangle pointing down, centred at (x, y). */
function roundedTri(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  const pts = [
    [x - r, y - r * 0.7],
    [x + r, y - r * 0.7],
    [x, y + r * 0.95],
  ]
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % 3]
    const [px, py] = pts[(i + 2) % 3]
    // start a little after each corner, curve round the next one
    const sx = ax + (bx - ax) * k
    const sy = ay + (by - ay) * k
    if (i === 0) ctx.moveTo(px + (ax - px) * (1 - k), py + (ay - py) * (1 - k))
    ctx.quadraticCurveTo(ax, ay, sx, sy)
    ctx.lineTo(bx + (ax - bx) * k, by + (ay - by) * k)
  }
  ctx.closePath()
}

/** The chest core: a glowing red rounded triangle with a V inside, on black. */
export function coreTexture(): THREE.CanvasTexture {
  const S = 1024
  const [c, ctx] = canvas(S, S)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.shadowColor = '#ff2a10'
  ctx.shadowBlur = 50
  ctx.strokeStyle = '#ff5a34'
  ctx.lineWidth = 46
  roundedTri(ctx, S / 2, S / 2 - 30, S * 0.36, 0.22)
  ctx.stroke()
  ctx.strokeStyle = '#ffc2a8'
  ctx.lineWidth = 16
  roundedTri(ctx, S / 2, S / 2 - 30, S * 0.36, 0.22)
  ctx.stroke()
  // the inner V
  ctx.strokeStyle = '#ff7a52'
  ctx.lineWidth = 40
  ctx.beginPath()
  ctx.moveTo(S * 0.36, S * 0.36)
  ctx.lineTo(S * 0.5, S * 0.6)
  ctx.lineTo(S * 0.64, S * 0.36)
  ctx.stroke()
  return tex(c)
}

/** A soft round glow (antenna tips, thruster light, the hover glow). */
export function glowTexture(): THREE.CanvasTexture {
  const S = 256
  const [c, ctx] = canvas(S, S)
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,230,210,1)')
  g.addColorStop(0.25, 'rgba(255,110,60,0.6)')
  g.addColorStop(1, 'rgba(255,40,20,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  return tex(c)
}

/** A canvas + texture pair for the face screen's eyes (redrawn as they change). */
export function faceCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
  // matched to the face cap's aspect, so the eyes are drawn undistorted
  const [c, ctx] = canvas(1536, 1100)
  const texture = tex(c)
  texture.wrapS = THREE.ClampToEdgeWrapping
  return { canvas: c, ctx, texture }
}
