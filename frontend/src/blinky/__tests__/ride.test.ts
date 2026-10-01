import { describe, expect, it } from 'vitest'
import { stepRide, type Ride } from '../ride'
import { rideBus } from '../rideBus'

describe('stepRide (3D)', () => {
  it('ends a 3D ride as soon as the twin is no longer showing 3D', () => {
    const r: Ride = { mode: '3d', el: null, id: 'v1', until: 100, last: null, stillSince: 0 }
    rideBus.vehicleId = 'v1'
    rideBus.view = '3d'
    expect(stepRide(r, 1).done).toBe(false)
    rideBus.view = 'plan'
    expect(stepRide(r, 2).done).toBe(true)
    expect(rideBus.vehicleId).toBeNull()
  })
})
