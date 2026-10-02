import type { LiveFacts } from './catalogue'

export const GREETINGS = ['Hi! I’m Sparky ⚡', 'Small bot, big energy!', 'Hey there, traffic friend!', 'Psst — drag my antenna onto anything!'] as const

export const FACTS = [
  'The first electric traffic light lit up in Cleveland, Ohio, in 1914.',
  'Amber is there so drivers can stop safely. That’s the 3 seconds between phases.',
  'A “phase” is a set of movements that get green together.',
  'Trinetra makes a new decision every second of simulated time.',
  'Red on top, amber in the middle, green at the bottom: the same order almost everywhere.',
] as const

export const JOKES = [
  'Why did the traffic light turn red? You’d blush too if everyone watched you change!',
  'I told the junction a joke. It took a while to cross.',
  'I’m not lazy, I’m on amber.',
  'What do you call a singing traffic light? A red-io star!',
] as const

/** The live state, in plain words. Null when nothing runs (no invented numbers). */
export function liveLine(f: LiveFacts): string | null {
  if (!f.running || !f.phase) return null
  return `${f.phase} has the green — held ${f.held ?? 0} s.`
}
