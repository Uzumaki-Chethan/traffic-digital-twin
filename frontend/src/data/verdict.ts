/**
 * Who is ahead on one metric, from the evaluator's signed improvement
 * percentage (positive = Trinetra better). Anything inside half a percent
 * is called even rather than dressed up as a win either way — the two
 * single-instant extremes (worst travel time, max queue) and throughput
 * (tied by construction) land there often.
 */
export type VerdictSide = 'trinetra' | 'vac' | 'even'

export interface Verdict {
  side: VerdictSide
  /** Magnitude of the lead, always ≥ 0. */
  pct: number
  /** Full sentence, for screen readers and the page summary. */
  label: string
  /** Badge form. The long label wrapped to two lines in a metric
   * panel's header and pushed the title onto two lines with it. */
  short: string
}

export const EVEN_BAND_PCT = 0.5

export function verdictFor(improvement: number): Verdict {
  if (Math.abs(improvement) < EVEN_BAND_PCT) return { side: 'even', pct: 0, label: 'Even', short: 'Even' }
  if (improvement > 0) {
    return {
      side: 'trinetra',
      pct: improvement,
      label: `Trinetra ahead ${improvement.toFixed(1)} %`,
      short: `Trinetra +${improvement.toFixed(1)}%`,
    }
  }
  const pct = -improvement
  return { side: 'vac', pct, label: `VAC ahead ${pct.toFixed(1)} %`, short: `VAC +${pct.toFixed(1)}%` }
}
