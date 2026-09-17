import { describe, expect, it } from 'vitest'
import { FIT_VIEW, HOME_VIEW, HOME_ZOOM, wheelIsZoom } from '../usePanZoom'

describe('the plan view window', () => {
  it('opens at 3.5x, relative to the whole network fitted', () => {
    expect(HOME_ZOOM).toBe(3.5)
    expect(FIT_VIEW.h / HOME_VIEW.h).toBeCloseTo(3.5, 6)
    expect(HOME_VIEW.cx).toBe(FIT_VIEW.cx)
    expect(HOME_VIEW.cy).toBe(FIT_VIEW.cy)
  })

  it('zooms only on a modified wheel; a plain turn is the page scrolling', () => {
    const plain = { ctrlKey: false, metaKey: false } as WheelEvent
    const ctrl = { ctrlKey: true, metaKey: false } as WheelEvent
    const pinch = { ctrlKey: true, metaKey: false } as WheelEvent // trackpad pinch arrives as ctrl+wheel
    const cmd = { ctrlKey: false, metaKey: true } as WheelEvent
    expect(wheelIsZoom(plain)).toBe(false)
    expect(wheelIsZoom(ctrl)).toBe(true)
    expect(wheelIsZoom(pinch)).toBe(true)
    expect(wheelIsZoom(cmd)).toBe(true)
  })
})
