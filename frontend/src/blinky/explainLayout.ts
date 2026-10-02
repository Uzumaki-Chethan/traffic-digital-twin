import type { Rect, Vec } from './types'

export const CARD_W = 380
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/**
 * Where the explainer card and Blinky go (spec §7.1). A page: the card
 * near the centre, Blinky big at its left. A component: the card beside it
 * on the side with more room, Blinky standing between them.
 */
export function presentLayout(
  anchor: Rect | null,
  view: { w: number; h: number },
): { card: { left: number; top: number }; blinky: Vec; size: number } {
  if (!anchor) {
    const left = Math.round(view.w / 2 - CARD_W / 2 + 70)
    const top = Math.round(view.h * 0.22)
    return { card: { left, top }, blinky: { x: left - 130, y: top + 330 }, size: 240 }
  }
  const roomRight = view.w - anchor.right
  const roomLeft = anchor.left
  const right = roomRight >= CARD_W + 200 || roomRight >= roomLeft
  const left = right ? Math.min(view.w - CARD_W - 16, anchor.right + 200) : Math.max(16, anchor.left - 200 - CARD_W)
  const top = clamp(anchor.top, 90, view.h - 340)
  // Zen is big (Section 40): he floats in the gap and may overlap either side.
  const bx = right ? left - 100 : left + CARD_W + 100
  return { card: { left, top }, blinky: { x: bx, y: Math.min(view.h - 40, top + 290) }, size: 170 }
}
