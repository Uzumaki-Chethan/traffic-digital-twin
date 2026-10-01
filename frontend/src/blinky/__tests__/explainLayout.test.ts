import { describe, expect, it } from 'vitest'
import { CARD_W, presentLayout } from '../explainLayout'

const view = { w: 1400, h: 800 }

describe('presentLayout', () => {
  it('a page: card centred-ish, Blinky to its left and big', () => {
    const l = presentLayout(null, view)
    expect(l.size).toBe(140)
    expect(l.blinky.x).toBeLessThan(l.card.left)
  })
  it('a component with room on the right: card to its right, Blinky between', () => {
    const l = presentLayout({ left: 300, top: 200, right: 600, bottom: 400 }, view)
    expect(l.card.left).toBeGreaterThan(600)
    expect(l.blinky.x).toBeGreaterThan(600)
    expect(l.blinky.x).toBeLessThan(l.card.left)
    expect(l.size).toBe(80)
  })
  it('a component near the right edge: card to its left', () => {
    const l = presentLayout({ left: 900, top: 200, right: 1350, bottom: 400 }, view)
    expect(l.card.left + CARD_W).toBeLessThan(900)
  })
  it('keeps the card on screen vertically', () => {
    const l = presentLayout({ left: 300, top: 760, right: 600, bottom: 790 }, view)
    expect(l.card.top).toBeLessThanOrEqual(view.h - 340)
    expect(presentLayout({ left: 300, top: 10, right: 600, bottom: 50 }, view).card.top).toBeGreaterThanOrEqual(90)
  })
})
