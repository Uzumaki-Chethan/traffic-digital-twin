import { useSim } from '@/data/store'

/** Thin footer: real facts only, on the same red -> amber -> green sweep
 * as the status bar so the two frame the page symmetrically. */
export function FooterBar() {
  const rate = useSim((s) => s.rate)
  return (
    <footer
      className="bar-flow flex h-8 shrink-0 items-center justify-between px-4 text-[12px] font-medium text-[var(--bar-ink)]"
      style={{ borderTop: '1px solid var(--bar-rule)' }}
    >
      <span className="num">SUMO · TraCI · read-only viewer · backend 127.0.0.1:8000</span>
      {rate != null && <span className="num">simulation running at ×{rate.toFixed(1)} real time</span>}
    </footer>
  )
}
