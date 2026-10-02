import * as THREE from 'three'

/**
 * Zen's surface detail, painted once into high-resolution canvases (design
 * sheet: woven bamboo hat with an engraved 禅 emblem and an ornamental
 * band, charcoal robe with gold lotus / cloud / circle motifs, ivory inner
 * cloth, golden scarf, swirl orbs, a lotus chest core, the charm tag and
 * the aura sigil). Everything is procedural — no image files.
 */

const GOLD = '#d9a441'
const GOLD_HI = '#f6d27c'
const CHARCOAL = '#23201d'
const IVORY = '#efe6d2'

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [c, ctx]
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 16
  t.wrapS = THREE.RepeatWrapping
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}

/** A cloud scroll: a little spiral with a tail, the sheet's recurring motif. */
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (let a = 0; a < Math.PI * 3.2; a += 0.08) {
    const rr = r * (1 - a / (Math.PI * 3.6))
    const px = x + Math.cos(a) * rr
    const py = y + Math.sin(a) * rr
    if (a === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.bezierCurveTo(x + r * 1.8, y - r * 0.2, x + r * 2.2, y + r * 0.8, x + r * 3, y + r * 0.3)
  ctx.stroke()
}

/** A lotus: a fan of pointed petals on a little base. */
function lotus(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: boolean) {
  const petals = [-0.9, -0.45, 0, 0.45, 0.9]
  for (const a of petals) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    const h = a === 0 ? r : r * 0.82
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(r * 0.38, -h * 0.35, r * 0.22, -h * 0.85, 0, -h)
    ctx.bezierCurveTo(-r * 0.22, -h * 0.85, -r * 0.38, -h * 0.35, 0, 0)
    if (fill) ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.ellipse(x, y + r * 0.12, r * 0.7, r * 0.16, 0, 0, Math.PI * 2)
  if (fill) ctx.fill()
  ctx.stroke()
}

/** The 禅 character, brush-weight. */
function zenChar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 ${size}px "Noto Serif SC", "Noto Serif JP", "Yu Mincho", "MS Mincho", "SimSun", serif`
  ctx.fillText('禅', x, y)
  ctx.restore()
}

/**
 * The conical hat (a lathe: u runs round the hat, v from the tip (v=0) to
 * the brim (v=1); with flipY the canvas TOP is the brim). The emblem is
 * painted at u = 0.5, which the model turns to face front.
 */
export function hatTexture(): THREE.CanvasTexture {
  const W = 4096
  const H = 1024
  const [c, ctx] = canvas(W, H)
  const yOf = (v: number) => (1 - v) * H
  // straw base with a warm gradient (lighter toward the brim)
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#e9d8ae')
  g.addColorStop(1, '#cdb47e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // woven ribs (radial) and rings (concentric), with grain noise
  ctx.globalAlpha = 0.28
  ctx.strokeStyle = '#8f7444'
  for (let i = 0; i < 360; i++) {
    ctx.lineWidth = i % 6 === 0 ? 3 : 1.2
    const x = (i / 360) * W
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let v = 0.06; v < 1; v += 0.035) {
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(0, yOf(v))
    ctx.lineTo(W, yOf(v))
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(120,90,40,0.08)' : 'rgba(255,245,215,0.08)'
    ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 2)
  }
  // charcoal ornamental band, gold-edged, with cloud scrolls
  const b0 = yOf(0.78)
  const b1 = yOf(0.56)
  ctx.fillStyle = CHARCOAL
  ctx.fillRect(0, b0, W, b1 - b0)
  ctx.fillStyle = GOLD
  ctx.fillRect(0, b0 - 6, W, 6)
  ctx.fillRect(0, b1, W, 6)
  ctx.strokeStyle = GOLD_HI
  ctx.lineWidth = 3.2
  for (let i = 0; i < 24; i++) cloud(ctx, (i + 0.25) * (W / 24), (b0 + b1) / 2, (b1 - b0) * 0.22)
  // gold edge line near the brim
  ctx.fillStyle = GOLD
  ctx.fillRect(0, yOf(0.975), W, 9)
  // a thin gold ring near the tip
  ctx.fillRect(0, yOf(0.16), W, 5)
  // the emblem at u = 0.5: a gold-rimmed charcoal disc with 禅
  const ex = W * 0.5
  const ey = yOf(0.38)
  const er = H * 0.14
  ctx.beginPath()
  ctx.ellipse(ex, ey, er * 1.25, er, 0, 0, Math.PI * 2)
  ctx.fillStyle = CHARCOAL
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = GOLD
  ctx.stroke()
  ctx.lineWidth = 3
  ctx.strokeStyle = GOLD_HI
  ctx.beginPath()
  ctx.ellipse(ex, ey, er * 1.1, er * 0.86, 0, 0, Math.PI * 2)
  ctx.stroke()
  zenChar(ctx, ex, ey + er * 0.05, er * 1.25, GOLD_HI)
  return tex(c)
}

/** Outer robe: charcoal with gold trims down both front edges and the hem, and gold motifs. */
export function robeOuterTexture(): THREE.CanvasTexture {
  const W = 4096
  const H = 2048
  const [c, ctx] = canvas(W, H)
  ctx.fillStyle = CHARCOAL
  ctx.fillRect(0, 0, W, H)
  // fabric weave
  for (let i = 0; i < 26000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)'
    ctx.fillRect(Math.random() * W, Math.random() * H, 3, 1)
  }
  // motifs: scattered lotus, cloud and circle patterns
  ctx.strokeStyle = 'rgba(217,164,65,0.75)'
  ctx.fillStyle = 'rgba(217,164,65,0.18)'
  ctx.lineWidth = 4
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 12; col++) {
      const x = (col + (row % 2) * 0.5 + 0.25) * (W / 12)
      const y = H * (0.18 + row * 0.2)
      const k = (row * 12 + col) % 3
      if (k === 0) lotus(ctx, x, y, 70, true)
      else if (k === 1) cloud(ctx, x - 40, y, 34)
      else {
        ctx.beginPath()
        ctx.arc(x, y, 46, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, 26, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }
  // gold trims: both front edges (u near 0 and 1) and the hem (the canvas top, v=1)
  const trim = (x: number, w: number) => {
    ctx.fillStyle = GOLD
    ctx.fillRect(x, 0, w, H)
    ctx.fillStyle = IVORY
    ctx.fillRect(x + w * 0.25, 0, w * 0.5, H)
    ctx.strokeStyle = GOLD_HI
    ctx.lineWidth = 3
    for (let y = 30; y < H; y += 90) cloud(ctx, x + w * 0.3, y, w * 0.12)
  }
  trim(0, 150)
  trim(W - 150, 150)
  ctx.fillStyle = GOLD
  ctx.fillRect(0, 0, W, 120)
  ctx.fillStyle = CHARCOAL
  ctx.fillRect(0, 26, W, 68)
  ctx.strokeStyle = GOLD_HI
  ctx.lineWidth = 3
  for (let i = 0; i < 40; i++) cloud(ctx, (i + 0.2) * (W / 40), 60, 18)
  return tex(c)
}

/** Inner cloth: ivory-beige with a faint woven texture and fine gold circles. */
export function robeInnerTexture(): THREE.CanvasTexture {
  const W = 2048
  const H = 1024
  const [c, ctx] = canvas(W, H)
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#cdb68a')
  g.addColorStop(1, '#e2d5b8')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 14000; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(120,95,50,0.06)' : 'rgba(255,255,255,0.08)'
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 1)
  }
  ctx.strokeStyle = 'rgba(190,140,50,0.35)'
  ctx.lineWidth = 2
  for (let y = 60; y < H; y += 120) {
    for (let x = 60; x < W; x += 120) {
      ctx.beginPath()
      ctx.arc(x + ((y / 120) % 2) * 60, y, 18, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.fillStyle = GOLD
  ctx.fillRect(0, 0, W, 30)
  return tex(c)
}

/** The golden scarf: warm silk with a soft tonal pattern and a gold border. */
export function scarfTexture(): THREE.CanvasTexture {
  const W = 512
  const H = 2048
  const [c, ctx] = canvas(W, H)
  const g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0, '#d49a2a')
  g.addColorStop(0.5, '#f2c457')
  g.addColorStop(1, '#d49a2a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(150,95,20,0.35)'
  ctx.lineWidth = 3
  for (let y = 80; y < H; y += 220) cloud(ctx, W * 0.32, y, 40)
  ctx.fillStyle = 'rgba(255,240,190,0.7)'
  ctx.fillRect(0, 0, 14, H)
  ctx.fillRect(W - 14, 0, 14, H)
  return tex(c)
}

/** A floating orb's swirl: gold tomoe on black glass (also its glow map). */
export function orbTexture(): THREE.CanvasTexture {
  const S = 1024
  const [c, ctx] = canvas(S * 2, S)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, S * 2, S)
  // painted twice across the sphere's u so the swirl shows from every side
  for (const ox of [0, S]) {
    const cx = ox + S / 2
    const cy = S / 2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.strokeStyle = '#ffcf6e'
    ctx.fillStyle = '#ffcf6e'
    ctx.shadowColor = '#ffb030'
    ctx.shadowBlur = 30
    ctx.lineWidth = 26
    ctx.beginPath()
    ctx.arc(0, 0, S * 0.36, 0, Math.PI * 2)
    ctx.stroke()
    for (let k = 0; k < 3; k++) {
      ctx.save()
      ctx.rotate((k * Math.PI * 2) / 3)
      ctx.beginPath()
      ctx.arc(0, -S * 0.12, S * 0.085, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 34
      ctx.beginPath()
      ctx.arc(0, 0, S * 0.12, -Math.PI / 2, Math.PI * 0.35)
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
  }
  return tex(c)
}

/** The lotus chest core: a glowing gold lotus on a dark disc. */
export function lotusTexture(): THREE.CanvasTexture {
  const S = 1024
  const [c, ctx] = canvas(S, S)
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, '#5a3a10')
  g.addColorStop(0.7, '#1a1208')
  g.addColorStop(1, '#000')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ffe2a0'
  ctx.fillStyle = 'rgba(255,214,120,0.9)'
  ctx.shadowColor = '#ffb030'
  ctx.shadowBlur = 40
  ctx.lineWidth = 10
  lotus(ctx, S / 2, S * 0.62, S * 0.3, true)
  return tex(c)
}

/** The charm tag hanging from the hat: a gold plate with 禅. */
export function tagTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 512)
  const g = ctx.createLinearGradient(0, 0, 256, 0)
  g.addColorStop(0, '#b8862c')
  g.addColorStop(0.5, '#f4cf75')
  g.addColorStop(1, '#b8862c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 512)
  ctx.strokeStyle = '#7a5410'
  ctx.lineWidth = 10
  ctx.strokeRect(12, 12, 232, 488)
  zenChar(ctx, 128, 250, 200, '#2a1a05')
  return tex(c)
}

/** The aura's sigil ring: fine gold marks around two circles, on transparent. */
export function sigilTexture(): THREE.CanvasTexture {
  const S = 1024
  const [c, ctx] = canvas(S, S)
  ctx.translate(S / 2, S / 2)
  ctx.strokeStyle = '#ffd27a'
  ctx.fillStyle = '#ffd27a'
  ctx.shadowColor = '#ffae30'
  ctx.shadowBlur = 18
  ctx.lineWidth = 6
  for (const r of [S * 0.46, S * 0.4, S * 0.22]) {
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.lineWidth = 4
  for (let i = 0; i < 48; i++) {
    ctx.save()
    ctx.rotate((i / 48) * Math.PI * 2)
    if (i % 4 === 0) {
      ctx.beginPath()
      ctx.arc(0, -S * 0.43, 9, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(0, -S * 0.455)
      ctx.lineTo(0, -S * 0.41)
      ctx.stroke()
    }
    ctx.restore()
  }
  for (let i = 0; i < 8; i++) {
    ctx.save()
    ctx.rotate((i / 8) * Math.PI * 2)
    lotus(ctx, 0, -S * 0.3, 34, false)
    ctx.restore()
  }
  return tex(c)
}

/** A soft round glow (sprites: halos around orbs and lamps, sparkles). */
export function glowTexture(): THREE.CanvasTexture {
  const S = 256
  const [c, ctx] = canvas(S, S)
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,240,200,1)')
  g.addColorStop(0.25, 'rgba(255,200,110,0.6)')
  g.addColorStop(1, 'rgba(255,160,40,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  return tex(c)
}

/** A canvas + texture pair for the face screen's eyes (redrawn as they change). */
export function faceCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
  // ~1.36:1, the face cap's own aspect, so the eyes are drawn undistorted
  const [c, ctx] = canvas(1536, 1128)
  const texture = tex(c)
  texture.wrapS = THREE.ClampToEdgeWrapping
  return { canvas: c, ctx, texture }
}
