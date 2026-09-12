import { Panel } from '@/ui/Panel'

/**
 * What the database is for, stated on the page itself. The live dashboard
 * does not need SQLite — the WebSocket carries live state. The database
 * exists so a run survives itself: it is what every panel on this page,
 * the decision audit trail, and the report's figures are read from.
 */
export function RecordedDataset({
  networkSamples,
  laneSamples,
  decisions,
}: {
  networkSamples: number | null
  laneSamples: number | null
  decisions: number | null
}) {
  return (
    <Panel title="Where this data comes from">
      <p className="text-[13px] leading-[1.5] text-ink">
        Live state reaches the Overview over a WebSocket and is never stored on the way. Everything on
        this page instead comes from the SQLite database the simulation writes as it runs — which is why
        these panels still work when nothing is running.
      </p>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Count label="Network samples" value={networkSamples} sub="one per decision tick" />
        <Count label="Per-lane samples" value={laneSamples} sub="12 lanes per tick" />
        <Count label="Decisions" value={decisions} sub="with full reason text" />
      </div>
      <ul className="mt-2.5 flex flex-col gap-1 border-t border-rule-soft pt-2 text-[12.5px] text-ink-mute">
        <li>
          <span className="text-ink">Writing is insert-only and failure-tolerant</span> — a logging error can
          never interrupt the control loop.
        </li>
        <li>
          <span className="text-ink">Nothing read here can influence the simulation</span>; the database is a
          one-way record, not a control path.
        </li>
      </ul>
    </Panel>
  )
}

function Count({ label, value, sub }: { label: string; value: number | null; sub: string }) {
  return (
    <div className="rounded-control bg-inset px-3 py-2">
      <div className="text-[12px] text-ink-mute">{label}</div>
      <div className="num mt-0.5 text-[20px] text-ink-strong">{value == null ? '—' : value.toLocaleString()}</div>
      <div className="text-[12px] text-ink-mute">{sub}</div>
    </div>
  )
}
