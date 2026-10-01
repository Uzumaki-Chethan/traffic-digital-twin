import { motionBuffer } from '@/data/motion'
import { isStalledVehicleId } from '@/overview/vehicleTypes'
import { rideBus } from './rideBus'
import { pick, type Rng } from './brain'
import type { Vec } from './types'

export interface Ride {
  mode: 'plan' | '3d'
  el: Element | null
  id: string
  until: number
  last: Vec | null
  stillSince: number
}

const EMERGENCY = new Set(['ambulance', 'police_vehicle', 'fire_engine'])

function ids3d(): string[] {
  const b = motionBuffer('demo')
  return b.latestIds().filter((id) => {
    const t = b.typeOf(id)
    return !(t && EMERGENCY.has(t)) && !isStalledVehicleId(id)
  })
}

function planEls(): Element[] {
  return [...document.querySelectorAll('[data-vid][data-ride="yes"]')].filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 2 && r.top > 0 && r.bottom < window.innerHeight
  })
}

/** Is there anything to ride right now (Overview, demo, a vehicle on screen)? */
export function rideable(): boolean {
  if (rideBus.view === 'plan') return planEls().length > 0
  if (rideBus.view === '3d') return ids3d().length > 0
  return false
}

export function startRide(now: number, rng: Rng): Ride | null {
  if (rideBus.view === 'plan') {
    const els = planEls()
    if (!els.length) return null
    const el = pick(rng, els)
    return { mode: 'plan', el, id: el.getAttribute('data-vid') ?? '', until: now + 6 + rng() * 4, last: null, stillSince: now }
  }
  if (rideBus.view === '3d') {
    const ids = ids3d()
    if (!ids.length) return null
    const id = pick(rng, ids)
    rideBus.vehicleId = id
    return { mode: '3d', el: null, id, until: now + 7 + rng() * 4, last: null, stillSince: now }
  }
  return null
}

function end(r: Ride, stuck: boolean): { done: true; stuck: boolean } {
  if (r.mode === '3d' && rideBus.vehicleId === r.id) rideBus.vehicleId = null
  return { done: true, stuck }
}

/**
 * Advance a ride. Plan: the rider's screen point (the vehicle's centre).
 * 3D: null (Junction3D draws the rider). Done when time's up, the vehicle
 * has gone, or it has stood still for 3 s ("this one's stuck!").
 */
export function stepRide(r: Ride, now: number): { done: false; pos: Vec | null } | { done: true; stuck: boolean } {
  if (now > r.until) return end(r, false)
  if (r.mode === '3d') return rideBus.view === '3d' && rideBus.vehicleId === r.id ? { done: false, pos: null } : end(r, false)
  const el = r.el
  if (!el || !el.isConnected) return end(r, false)
  const b = el.getBoundingClientRect()
  if (b.width < 1) return end(r, false)
  const p = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  if (!r.last || Math.hypot(p.x - r.last.x, p.y - r.last.y) > 0.3) r.stillSince = now
  r.last = p
  if (now - r.stillSince > 3) return end(r, true)
  return { done: false, pos: p }
}
