import { describe, expect, it } from 'vitest'
import { copSpot } from '../pranks'
import { REST_HIT_HALF } from '../pranks'

describe('copSpot', () => {
  it('stands beside the run buttons, never under them', () => {
    const buttons = { left: 1100, top: 38, right: 1270, bottom: 82 }
    const p = copSpot(buttons, 111)
    expect(p.y).toBe(111)
    expect(p.x + REST_HIT_HALF).toBeLessThan(buttons.left)
  })
})
