import { useState } from 'react'
import { Info } from 'lucide-react'
import { Panel } from '@/components/common/Panel'
import { CommandSnippet } from '@/components/common/CommandSnippet'
import { useSimStore } from '@/store/useSimStore'
import { isLive, isWaiting } from '@/types/snapshot'
import { EVALUATOR_SCENARIOS, DEMO_SCENARIOS } from '@/utils/scenarios'

export function ScenarioControlPage() {
  const latest = useSimStore((s) => s.latest)
  const [seed, setSeed] = useState(1)

  const runningLive = isLive(latest) && latest.signal !== null
  const runningComparison = isLive(latest) && latest.comparison !== null
  const waiting = latest === null || isWaiting(latest)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-[var(--color-neutral)]" />
        <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">
          By design, the backend has no HTTP endpoint that starts, stops, or reconfigures a simulation - see
          <code className="mx-1 rounded bg-[var(--color-panel-inset)] px-1 py-0.5 font-mono">dashboard_server.py</code>
          's pure-viewer rule. This page is an operator console: it shows exactly what's running right now and gives
          you the correct command to launch the next run from a terminal. Copy a command, run it, and this dashboard
          will pick up the new stream automatically.
        </p>
      </div>

      <Panel title="Note: sumo/config/demo/ configs" eyebrow="Data-accuracy note">
        <p className="text-xs leading-relaxed text-[var(--color-text-dim)]">
          Five demo <code className="mx-1 rounded bg-[var(--color-panel-inset)] px-1 py-0.5 font-mono">.sumocfg</code>{' '}
          files exist under <code className="mx-1 rounded bg-[var(--color-panel-inset)] px-1 py-0.5 font-mono">sumo/config/demo/</code>{' '}
          (accident, emergency_response, normal_traffic, rain, rush_hour), but{' '}
          <code className="mx-1 rounded bg-[var(--color-panel-inset)] px-1 py-0.5 font-mono">performance/evaluator.py</code> only
          reads from <code className="mx-1 rounded bg-[var(--color-panel-inset)] px-1 py-0.5 font-mono">sumo/config/scenarios/</code> -
          they aren't currently reachable via <code className="rounded bg-[var(--color-panel-inset)] px-1 py-0.5 font-mono">--scenario</code>.
          Until that's wired up, use the equivalently-named seeded scenario below for a live demo, or launch a demo config directly
          with plain SUMO (no AI loop attached):
        </p>
        <div className="mt-2 space-y-1.5">
          {DEMO_SCENARIOS.map((name) => (
            <CommandSnippet key={name} command={`sumo-gui -c sumo/config/demo/${name}.sumocfg`} />
          ))}
        </div>
      </Panel>

      <Panel title="Current Status" eyebrow="Inferred from the live stream">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatusRow label="Live control loop" active={runningLive} activeLabel="app.py running" inactiveLabel="not running" />
          <StatusRow
            label="Comparison evaluator"
            active={runningComparison}
            activeLabel="evaluator --dashboard running"
            inactiveLabel="not running"
          />
          <StatusRow label="Dashboard stream" active={!waiting} activeLabel="receiving snapshots" inactiveLabel="waiting" />
        </div>
      </Panel>

      <Panel title="Run the Live Control Loop" eyebrow="Full closed loop: Twin → Prediction → Decision → Signal Controller">
        <p className="mb-3 text-xs text-[var(--color-text-dim)]">
          Runs continuously against the frozen <code className="rounded bg-[var(--color-panel-inset)] px-1 py-0.5 font-mono">intersection.sumocfg</code> -
          this is what feeds the Digital Twin page.
        </p>
        <CommandSnippet command="cd backend && python app.py" />
      </Panel>

      <Panel title="Run a Performance Evaluation" eyebrow="AI vs SUMO baseline, one scenario at a time">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-text-dim)]">Seed</span>
          {[1, 2, 3].map((s) => (
            <button
              key={s}
              onClick={() => setSeed(s)}
              className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
              style={
                seed === s
                  ? { borderColor: 'var(--color-neutral)', color: 'var(--color-neutral)', backgroundColor: 'var(--color-neutral-dim)' }
                  : { borderColor: 'var(--color-border)', color: 'var(--color-text-dim)' }
              }
            >
              seed{s}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {['Baseline load', 'Named scenario', 'Directional imbalance'].map((category) => (
            <div key={category}>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">{category}</div>
              <div className="space-y-1.5">
                {EVALUATOR_SCENARIOS.filter((s) => s.category === category && s.seeds.includes(seed)).map((s) => (
                  <CommandSnippet
                    key={s.name}
                    command={`cd backend && python -m performance.evaluator --scenario ${s.name}_seed${seed} --dashboard`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-[var(--color-text-faint)]">
          Add <code className="rounded bg-[var(--color-panel-inset)] px-1 py-0.5 font-mono">--gui</code> to also open both SUMO windows
          side by side for a live demo (Section 15's Demo Day Script).
        </p>
      </Panel>


    </div>
  )
}

function StatusRow({
  label,
  active,
  activeLabel,
  inactiveLabel,
}: {
  label: string
  active: boolean
  activeLabel: string
  inactiveLabel: string
}) {
  const color = active ? 'var(--color-flow)' : 'var(--color-text-faint)'
  return (
    <div className="rounded-md border border-[var(--color-border-soft)] bg-[var(--color-panel-inset)] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className={active ? 'h-2 w-2 rounded-full animate-pulse' : 'h-2 w-2 rounded-full'} style={{ backgroundColor: color }} />
        <span className="text-xs font-medium" style={{ color: active ? 'var(--color-text)' : 'var(--color-text-faint)' }}>
          {active ? activeLabel : inactiveLabel}
        </span>
      </div>
    </div>
  )
}
