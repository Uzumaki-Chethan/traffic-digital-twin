export function clock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function f1(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? '—' : n.toFixed(1)
}
export function f0(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? '—' : Math.round(n).toString()
}
/** Prediction confidence is a 0–100 score (ml_predictor.py::_confidence),
 * not a 0–1 fraction. Do not multiply. */
export function conf0(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? '—' : `${Math.round(n)}%`
}
