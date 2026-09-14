import { useState } from 'react'
import { motion } from 'framer-motion'
import { Monitor, Play } from 'lucide-react'
import { Panel } from '@/ui/Panel'
import { runControl, useRunStore, type RunState } from '@/data/runState'
import { useSettings } from '@/data/settings'

/**
 * What Analytics shows before there is anything to analyse.
 *
 * This page reads the running simulation, so an empty state is the
 * honest answer rather than a failure — and since the console can now
 * start a run itself, the empty state is also the place to do it. What
 * it offers depends on what the backend says it can do (see
 * data/runState.ts), never on an assumption:
 *
 *   console, nothing running   Start buttons, headless or with SUMO
 *   run up, no ticks yet       "starting" — SUMO launch + model load
 *   started by python app.py   the terminal instruction, honestly
 *   no control layer at all    the terminal instruction, honestly
 */
export function StartPrompt({ run }: { run: RunState | null }) {
  const busy = useRunStore((s) => s.busy)
  const demoScenario = useSettings((s) => s.demoScenario)
  const failure = useRunStore((s) => s.failure)
  const [launched, setLaunched] = useState(false)

  const canStart = run?.can_start === true
  const starting = run?.running === true || launched

  return (
    <div className="flex h-full items-center justify-center">
      <motion.div
        className="w-full max-w-lg"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
      >
        <Panel title={starting ? 'Waiting for the first tick' : 'Live data — nothing running yet'}>
          <div className="text-[13px] leading-[1.55] text-ink">
            {starting ? (
              <p>
                The simulation is starting. SUMO has to launch and the Random Forest model has to load
                before the first tick arrives — that takes a few seconds, and then every panel on this
                page fills in and keeps updating.
              </p>
            ) : (
              <>
                <p>
                  Every chart on this page reads the simulation as it runs — lane pressure, controller
                  behaviour, network response. There is no recorded playback here, so there is nothing
                  to show until a simulation is running.
                </p>
                <p className="mt-2 text-ink-mute">
                  Start one and this page fills in tick by tick. When the run ends, whatever it
                  recorded stays on screen.
                </p>
              </>
            )}

            {canStart && !starting && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule-soft pt-3">
                <StartButton
                  primary
                  icon={<Play size={14} aria-hidden />}
                  label="Start simulation"
                  hint="headless — watch it here"
                  disabled={busy}
                  onClick={() => {
                    setLaunched(true)
                    void runControl.start(false, demoScenario)
                  }}
                />
                <StartButton
                  icon={<Monitor size={14} aria-hidden />}
                  label="Start with SUMO window"
                  hint="opens sumo-gui too"
                  disabled={busy}
                  onClick={() => {
                    setLaunched(true)
                    void runControl.start(true, demoScenario)
                  }}
                />
              </div>
            )}

            {!canStart && !starting && (
              <p className="mt-3 border-t border-rule-soft pt-3 text-[12.5px] text-ink-mute">
                {run?.available
                  ? 'This dashboard is running inside a simulation, so it cannot start another one. The run it belongs to has ended.'
                  : 'This page cannot start a run from here. Launch the console with '}
                {!run?.available && (
                  <>
                    <span className="num text-ink">python server.py</span> from{' '}
                    <span className="num text-ink">backend/</span>, then press Start in the top bar.
                  </>
                )}
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

function StartButton({
  onClick,
  disabled,
  label,
  hint,
  icon,
  primary,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  hint: string
  icon: React.ReactNode
  primary?: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      className={
        primary
          ? 'flex items-center gap-2 rounded-control border border-ink-strong bg-ink-strong px-3 py-1.5 text-left text-[13px] font-semibold text-[var(--ink-on-dark)] disabled:opacity-50'
          : 'flex items-center gap-2 rounded-control border border-rule px-3 py-1.5 text-left text-[13px] font-medium text-ink hover:bg-hover disabled:opacity-50'
      }
    >
      {icon}
      <span className="flex flex-col leading-tight">
        <span>{label}</span>
        <span className={primary ? 'text-[11.5px] font-normal opacity-80' : 'text-[11.5px] font-normal text-ink-mute'}>
          {hint}
        </span>
      </span>
    </motion.button>
  )
}
