export function fmtSeconds(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const mm = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
}

export function fmt1(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return n.toFixed(1)
}

export function fmt0(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  return Math.round(n).toString()
}

export function fmtSigned(n: number | undefined | null, digits = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}`
}

export function fmtApproach(laneId: string): string {
  const names: Record<string, string> = { N: 'North', S: 'South', E: 'East', W: 'West' }
  return names[laneId.charAt(0)] ?? laneId.charAt(0)
}

export function fmtLaneMovement(laneId: string): string {
  // e.g. "N_in_0" -> left turn lane, "_1" -> straight, "_2" -> right,
  // per decision_engine.py's verified _PHASE_EXCLUSIVE_LANES / _LEFT_TURN_LANES.
  if (laneId.endsWith('_0')) return 'Left'
  if (laneId.endsWith('_1')) return 'Straight'
  if (laneId.endsWith('_2')) return 'Right'
  return laneId
}
