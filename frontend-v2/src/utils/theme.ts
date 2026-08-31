import type { DecisionMode, PhaseName, SumoSignalChar } from '@/types/snapshot'

/**
 * Every place in the app that colors a decision mode, a phase, or a raw
 * SUMO signal character reads from here, so the meaning of a color never
 * drifts between the Digital Twin page, the Logs page, and the Overview
 * cards.
 */

export const MODE_META: Record<DecisionMode, { label: string; color: string; dim: string }> = {
  priority: { label: 'NORMAL', color: 'var(--color-neutral)', dim: 'var(--color-neutral-dim)' },
  min_green_hold: { label: 'MIN GREEN HOLD', color: 'var(--color-neutral)', dim: 'var(--color-neutral-dim)' },
  starvation_override: { label: 'STARVATION OVERRIDE', color: 'var(--color-warn)', dim: 'var(--color-warn-dim)' },
  emergency: { label: 'EMERGENCY OVERRIDE', color: 'var(--color-stop)', dim: 'var(--color-stop-dim)' },
}

export function modeMeta(mode: string | undefined) {
  if (mode && mode in MODE_META) return MODE_META[mode as DecisionMode]
  return { label: mode ?? 'UNKNOWN', color: 'var(--color-text-faint)', dim: 'var(--color-panel-inset)' }
}

export const PHASE_LABELS: Record<PhaseName, string> = {
  NS_straight_left: 'N-S Straight + Left',
  NS_right: 'N-S Right Turn',
  EW_straight_left: 'E-W Straight + Left',
  EW_right: 'E-W Right Turn',
}

export function phaseLabel(phase: string | undefined): string {
  if (!phase) return '—'
  return PHASE_LABELS[phase as PhaseName] ?? phase
}

/** Raw SUMO getRedYellowGreenState() character -> our signal color. */
export function signalColor(ch: SumoSignalChar): string {
  const c = ch.toLowerCase()
  if (c === 'g') return 'var(--color-flow)'
  if (c === 'y') return 'var(--color-transition)'
  return 'var(--color-stop)'
}

export function signalLabel(ch: SumoSignalChar): 'GO' | 'CAUTION' | 'STOP' {
  const c = ch.toLowerCase()
  if (c === 'g') return 'GO'
  if (c === 'y') return 'CAUTION'
  return 'STOP'
}
