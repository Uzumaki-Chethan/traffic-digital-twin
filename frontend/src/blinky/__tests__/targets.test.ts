import { describe, expect, it } from 'vitest'
import { orderTargets } from '../targets'

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
