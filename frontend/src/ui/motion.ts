/**
 * The product's motion vocabulary, in one file.
 *
 * Every animation in the app draws its duration and easing from here, so
 * the whole interface shares one rhythm — the thing that separates a
 * designed interface from one where each component invented its own
 * timing. The values mirror the `--dur-*` / `--ease-*` tokens in
 * styles/tokens.css; change them together.
 *
 * Two rules that shape everything below:
 *   - Duration follows DISTANCE. A chip flipping state (120ms) and a
 *     panel arriving from 14px below (420ms) cannot share a number.
 *   - Leaving is quicker than arriving (~65%), because a UI that clears
 *     out slowly feels unresponsive in a way an entrance never does.
 */

import type { TargetAndTransition, Transition, Variants } from 'framer-motion'

export const EASE_OUT = [0.16, 1, 0.3, 1] as const
export const EASE_MID = [0.65, 0, 0.35, 1] as const
/** Overshoots ~4%: for things the user just pressed. Never for data. */
export const EASE_SPRING = [0.22, 1.18, 0.36, 1] as const

export const DUR = {
  tick: 0.12,
  fast: 0.18,
  value: 0.3,
  enter: 0.42,
  phase: 0.9,
} as const

/** Step between neighbours in a sequence. */
export const STAGGER = 0.07

/** The default: an answer to the pointer. */
export const fast: Transition = { duration: DUR.fast, ease: EASE_OUT }
/** A value or a bar easing to a new reading. */
export const value: Transition = { duration: DUR.value, ease: EASE_OUT }
/** Arriving on screen. */
export const enter: Transition = { duration: DUR.enter, ease: EASE_OUT }
/** Leaving it. */
export const exit: Transition = { duration: DUR.enter * 0.65, ease: EASE_MID }

/**
 * A panel arriving as part of a page. `index` is its place in the
 * sequence; the stagger is capped so the last panel of a long page is
 * never left waiting on the first eleven.
 */
export function arrive(index = 0): {
  initial: TargetAndTransition
  animate: TargetAndTransition
  transition: Transition
} {
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { ...enter, delay: Math.min(index * STAGGER, 0.5) },
  }
}

/**
 * Press feedback for anything tappable. 0.97 is enough to feel and small
 * enough that it cannot disturb the layout around it.
 */
export const press = {
  whileTap: { scale: 0.97 },
  transition: { duration: DUR.tick, ease: EASE_SPRING },
} as const

/**
 * Content swapped inside a container that keeps its place: crossfade,
 * never slide. Used for verdicts, prompts and empty states.
 */
export const crossfade: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}

/** Motion that must not run when the user has asked for stillness. */
export function still<T>(reduced: boolean, motionProps: T, plain: T): T {
  return reduced ? plain : motionProps
}
