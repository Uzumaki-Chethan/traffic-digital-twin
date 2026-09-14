import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play, SlidersHorizontal } from 'lucide-react'
import { Panel } from '@/ui/Panel'
import { StartButton } from '@/analytics/StartPrompt'
import { runControl, useRunStore, type RunState } from '@/data/runState'
import { useSettings } from '@/data/settings'
import { scenarioName } from '@/data/scenarios'

/**
 * What Performance shows before there is an evaluation to watch. Like
 * Analytics' StartPrompt, it is also where the evaluation can be
 * started - on the scenario chosen in Simulation Settings.
 */
export function EvalStartPrompt({ run }: { run: RunState | null }) {
  const busy = useRunStore((s) => s.busy)
  const failure = useRunStore((s) => s.failure)
  const evalScenario = useSettings((s) => s.evalScenario)
  const [launched, setLaunched] = useState(false)

  const canStart = run?.can_start === true
  const demoActive = run?.running === true && run.kind === 'demo'
  const starting = (run?.running === true && run.kind === 'evaluation') || launched

  return (
    <div className="flex h-full items-center justify-center">
      <motion.div
        className="w-full max-w-lg"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
      >
        <Panel title={starting ? 'Starting the evaluation' : 'Trinetra vs VAC — nothing running yet'}>
          <div className="text-[13px] leading-[1.55] text-ink">
            {starting ? (
              <p>
                Two simulations of the same scenario are launching — one driven by Trinetra, one by
                vehicle-actuated control. Both junctions appear here once the first tick arrives.
              </p>
            ) : demoActive ? (
              <p>
                A demo run is active. Stop it on{' '}
                <Link to="/" className="underline decoration-[var(--rule-strong)] underline-offset-2">Overview</Link>{' '}
                to start an evaluation — the console runs one thing at a time.
              </p>
            ) : (
              <>
                <p>
                  The same scenario runs twice, in lockstep: Trinetra on one junction, vehicle-actuated
                  control on the other. Seven metrics are scored as it goes, and each one says who is ahead.
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-ink-mute">
                  <SlidersHorizontal size={12} aria-hidden />
                  Scenario: <span className="text-ink-strong">{scenarioName(evalScenario)}</span>
                  <Link to="/settings" className="underline decoration-[var(--rule-strong)] underline-offset-2">
                    change
                  </Link>
                </p>
              </>
            )}

            {canStart && !starting && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule-soft pt-3">
                <StartButton
                  primary
                  icon={<Play size={14} aria-hidden />}
                  label="Start evaluation"
                  hint={`${scenarioName(evalScenario)} · Trinetra vs VAC`}
                  disabled={busy}
                  onClick={() => {
                    setLaunched(true)
                    void runControl.startEvaluation(evalScenario)
                  }}
                />
              </div>
            )}

            {!canStart && !starting && !demoActive && (
              <p className="mt-3 border-t border-rule-soft pt-3 text-[12.5px] text-ink-mute">
                This page cannot start an evaluation from here. Launch the console with{' '}
                <span className="num text-ink">python server.py</span> from{' '}
                <span className="num text-ink">backend/</span>.
              </p>
            )}

            {failure && (
              <p className="mt-2 rounded-control border border-alert bg-alert-wash px-2 py-1 text-[12.5px] text-alert">
                {failure}
              </p>
            )}
            {run?.error && !starting && (
              <p className="mt-2 text-[12px] text-ink-mute">
                Last run ended with: <span className="num">{run.error}</span>
              </p>
            )}
          </div>
        </Panel>
      </motion.div>
    </div>
  )
}
