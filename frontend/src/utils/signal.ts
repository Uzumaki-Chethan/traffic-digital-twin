import type { DecisionMode, PhaseName } from '@/data/types'

export type LampState = 'green' | 'amber' | 'red' | 'off'

/**
 * Raw SUMO signal-state character -> lamp. Every character SUMO can emit
 * is handled by name; unknown falls to 'off' (grey, visibly not a signal).
 *   G  green, priority        g  green, permissive (yield)
 *   y  yellow                 Y  yellow (rare)
 *   r  red                    R  red (rare)
 *   s  red, turn permitted    u  red+amber (start-up)
 *   o  blinking               O  off, no signal
 */
export function lampOf(ch: string): LampState {
  switch (ch) {
    case 'G':
    case 'g':
      return 'green'
    case 'y':
    case 'Y':
    case 'u':
      return 'amber'
    case 'r':
    case 'R':
    case 's':
      return 'red'
    default:
      return 'off'
  }
}

export function isPermissive(ch: string): boolean {
  return ch === 'g' || ch === 's'
}

export function lampLabel(l: LampState): string {
  return l === 'green' ? 'Green' : l === 'amber' ? 'Amber' : l === 'red' ? 'Red' : 'Off'
}

export function lampColor(l: LampState): string {
  return l === 'green'
    ? 'var(--signal-green)'
    : l === 'amber'
      ? 'var(--signal-amber)'
      : l === 'red'
        ? 'var(--signal-red)'
        : 'var(--ink-faint)'
}

export function lampLit(l: LampState): string {
  return l === 'green'
    ? 'var(--lamp-green)'
    : l === 'amber'
      ? 'var(--lamp-amber)'
      : l === 'red'
        ? 'var(--lamp-red)'
        : 'var(--lamp-unlit)'
}

const PHASE_LABEL: Record<PhaseName, string> = {
  NS_straight_left: 'N–S straight + left',
  NS_right: 'N–S right turn',
  EW_straight_left: 'E–W straight + left',
  EW_right: 'E–W right turn',
}
export function phaseLabel(p: string | undefined | null): string {
  if (!p) return '—'
  return (PHASE_LABEL as Record<string, string>)[p] ?? p
}
export function phaseAxis(p: string): 'NS' | 'EW' | null {
  if (p.startsWith('NS_')) return 'NS'
  if (p.startsWith('EW_')) return 'EW'
  return null
}

/** Six modes, each with a plain-words label. Emergency and starvation are
 * the two that must grab the eye; the rest stay quiet. */
export interface ModeMeta {
  label: string
  /** One plain sentence a viewer can read in the panel. */
  describe: string
  loud: boolean
}
export const MODE_META: Record<DecisionMode, ModeMeta> = {
  priority: {
    label: 'Priority',
    describe: 'The phase with the highest demand score is being served.',
    loud: false,
  },
  min_green_hold: {
    label: 'Minimum green',
    describe: 'Holding: a phase must run at least its minimum green before it can be switched, even if another phase scores higher.',
    loud: false,
  },
  gap_out: {
    label: 'Gap-out',
    describe: 'The lanes this phase serves have emptied, so it is being released early to the next best phase.',
    loud: false,
  },
  light_traffic_patience: {
    label: 'Light traffic',
    describe: 'Traffic is light enough that the engine is not pre-empting the current phase.',
    loud: false,
  },
  starvation_override: {
    label: 'Starvation override',
    describe: 'A phase has waited past its hard limit and is being forced through regardless of score.',
    loud: true,
  },
  emergency: {
    label: 'Emergency',
    describe: 'An emergency vehicle has been detected; its approach is being given priority.',
    loud: true,
  },
}
export function modeMeta(m: string | undefined | null): ModeMeta {
  return (m && (MODE_META as Record<string, ModeMeta>)[m]) || { label: m ?? '—', describe: '', loud: false }
}

export const MOVEMENT: Record<'0' | '1' | '2', string> = { '0': 'Left', '1': 'Straight', '2': 'Right' }
export function movementOf(laneId: string): string {
  return MOVEMENT[laneId.slice(-1) as '0' | '1' | '2'] ?? '—'
}
export const APPROACH_NAME: Record<string, string> = { N: 'North', S: 'South', E: 'East', W: 'West' }

/** "North · Left" for N_in_0 - the one wording every lane label uses on
 * screen since 2026-09-14. SUMO's lane ids stay in the payload only. */
export function laneLabel(laneId: string): string {
  const approach = APPROACH_NAME[laneId.charAt(0)]
  if (!approach) return laneId
  return `${approach} · ${movementOf(laneId)}`
}
