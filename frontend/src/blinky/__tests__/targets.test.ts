import { describe, expect, it } from 'vitest'
import { orderTargets, pickTarget } from '../targets'

const r = (id: string, left: number, top: number) => ({ id, left, top, right: left + 100, bottom: top + 50 })

describe('orderTargets', () => {
  it('reads like a page: rows top to bottom, then left to right', () => {
    const out = orderTargets([r('c', 500, 300), r('a', 100, 100), r('d', 100, 300), r('b', 400, 104)])
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'd', 'c'])
  })
  it('drops zero-size targets', () => {
    expect(orderTargets([{ id: 'z', left: 0, top: 0, right: 0, bottom: 0 }])).toEqual([])
  })
})

describe('pickTarget', () => {
  type FakeEl = { owner: 'blinky' | 'page'; explain: string | null; closest(s: string): FakeEl | null; getAttribute(n: string): string | null }
  const el = (owner: 'blinky' | 'page', explain: string | null): FakeEl => {
    const e: FakeEl = {
      owner,
      explain,
      closest: (s) => (s === '[data-blinky]' ? (owner === 'blinky' ? e : null) : explain ? e : null),
      getAttribute: (n) => (n === 'data-explain' ? explain : null),
    }
    return e
  }
  it('released over Blinky itself: nothing to explain (not the card under it)', () => {
    expect(pickTarget([el('blinky', null), el('page', 'twin')])).toBeNull()
  })
  it('released over a tagged element: that element', () => {
    expect(pickTarget([el('page', 'twin')])?.id).toBe('twin')
  })
})
