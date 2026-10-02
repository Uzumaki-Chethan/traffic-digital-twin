/**
 * Dev-only Sparky preview (frontend/sparky.html; not part of the console build):
 * Sparky big on a dark stage, posed from the URL or from the console —
 *   sparky.html?anim=idle&mood=happy&turn=0&size=420
 *   window.sparky.set({ anim: 'cheer', turn: Math.PI })
 * Used to compare him against the owner’s design sheet (Section 41).
 */
import { mountBot } from './Blinky3D'
import { restPose } from './model'
import type { Anim, Mood, Prop } from './types'

const q = new URLSearchParams(location.search)
const pose = restPose()
pose.anim = (q.get('anim') as Anim) ?? 'idle'
pose.mood = (q.get('mood') as Mood) ?? 'happy'
pose.prop = (q.get('prop') as Prop) ?? null
pose.facing = 0
let turn = Number(q.get('turn') ?? 0)
const size = Number(q.get('size') ?? 420)
const t0 = performance.now()

const stage = document.getElementById('stage') as HTMLElement
const label = document.getElementById('label') as HTMLElement

// ?grid=expressions | turnaround — a design-sheet strip of small Sparkys
const grid = q.get('grid')
if (grid) {
  const EXPR: [Anim, Mood, string][] = [
    ['idle', 'happy', 'happy'],
    ['cheer', 'happy', 'excited'],
    ['look', 'curious', 'curious'],
    ['worried', 'sad', 'thinking'],
    ['held', 'curious', 'surprised'],
    ['sleep', 'sleepy', 'sleepy'],
    ['idle', 'disco', 'laughing'],
    ['blush', 'happy', 'peaceful'],
  ]
  const TURN: [number, string][] = [
    [0, 'front'],
    [-Math.PI / 4, 'front-left'],
    [-Math.PI / 2, 'left'],
    [Math.PI, 'back'],
    [Math.PI / 2, 'right'],
    [Math.PI / 4, 'front-right'],
  ]
  const cells = grid === 'turnaround' ? TURN.map(([t, n]) => ({ anim: 'idle' as Anim, mood: 'happy' as Mood, turn: t, name: n })) : EXPR.map(([a, m, n]) => ({ anim: a, mood: m, turn: 0, name: n }))
  document.body.style.display = 'grid'
  document.body.style.gridTemplateColumns = `repeat(${Math.min(4, cells.length)}, ${1.8 * size}px)`
  stage.remove()
  label.textContent = `Sparky · ${grid}`
  for (const c of cells) {
    const cell = document.createElement('div')
    cell.style.cssText = `position:relative;width:${1.8 * size}px;height:${1.8 * size}px`
    const cap = document.createElement('div')
    cap.textContent = c.name
    cap.style.cssText = 'position:absolute;bottom:6px;width:100%;text-align:center;letter-spacing:.15em;text-transform:uppercase;font-size:12px'
    cell.appendChild(cap)
    document.body.appendChild(cell)
    const p = restPose()
    p.anim = c.anim
    p.mood = c.mood
    p.facing = 0
    mountBot(cell, {
      cssPx: 1.8 * size,
      pose: () => {
        const now = (performance.now() - t0) / 1000
        p.t = now
        p.animT = 0.25
        return p
      },
      turn: () => c.turn,
      onFail: (err) => console.error('Sparky preview failed', err),
    })
  }
}

const show = () => {
  label.textContent = `Sparky · ${pose.anim} · ${pose.mood}${pose.prop ? ' · ' + pose.prop : ''}`
}
show()
if (!grid) mountBot(stage, {
  cssPx: 1.8 * size,
  pose: () => {
    const now = (performance.now() - t0) / 1000
    pose.animT = now
    pose.t = now
    return pose
  },
  turn: () => turn,
  onFail: (err) => console.error('Sparky preview failed', err),
})
;(window as unknown as { sparky: unknown }).sparky = {
  pose,
  set(p: { anim?: Anim; mood?: Mood; prop?: Prop; turn?: number }) {
    if (p.anim) pose.anim = p.anim
    if (p.mood) pose.mood = p.mood
    if (p.prop !== undefined) pose.prop = p.prop
    if (p.turn !== undefined) turn = p.turn
    show()
  },
}
