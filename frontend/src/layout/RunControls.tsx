import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Gauge, Monitor, Pause, Play, Square } from 'lucide-react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { runControl, useRunStore } from '@/data/runState'
import { usePageContext } from '@/data/pageContext'
import { DUR, EASE_OUT } from '@/ui/motion'

/**
 * Start / pause / stop / speed for the simulation, in the top bar, wired
 * to the control endpoints in backend/services/control_routes.py.
 *
 * Which controls appear is decided by the backend, not guessed (see
 * data/runState.ts):
 *
 *   python server.py, idle      Start, and Start-with-SUMO-window
 *   python server.py, running   Pause/Play, Stop, Open window, speed
 *   python app.py               Pause/Play, Stop — nothing to start,
 *                               because this dashboard IS the run
 *   evaluator dashboard         nothing at all
 *
 * The bar belongs to the PAGE (data/pageContext.ts): on Performance it
 * starts and drives the evaluation, on Overview and Analytics the demo,
 * on Simulation Settings whichever page its dropdown names — and then
 * goes there. If the other kind of run is up, the bar still offers
 * Start: pressing it ends that run and starts this page's, because a
 * reader on Performance who finds Pause/Stop for a demo they cannot see
 * has no idea what they are pausing.
 *
 * SPEED is here because it has to be: a headless run has no sumo-gui
 * Delay slider of its own and would otherwise step at roughly a hundred
 * times real time the moment it started, which is unwatchable. 1x means
 * one simulated second per real second. The button cycles on click and
 * reveals a slider on hover — the same control, two ways to reach it.
 */

const SPEEDS: (number | null)[] = [0.25, 0.5, 1, 2, 5, null]
const DEFAULT_INDEX = 2 // 1x

function speedLabel(speed: number | null): string {
  return speed === null ? 'max' : `${speed}×`
}

function speedIndex(speed: number | null): number {
  const i = SPEEDS.findIndex((s) => s === speed)
  return i === -1 ? DEFAULT_INDEX : i
}

export function RunControls() {
  const state = useRunStore((s) => s.state)
  const busy = useRunStore((s) => s.busy)
  const page = usePageContext()
  const navigate = useNavigate()

  if (!state?.available) return null

  // Nothing of this page's kind is running: offer a way to begin. If the
  // OTHER kind is up, Start ends it first (runState.replace*) and the
  // tooltip says so. From Settings, Start also goes to the page it runs.
  if (state.managed && !page.running) {
    const goHome = () => {
      if (page.path.startsWith('/settings')) navigate(page.home)
    }
    const other = page.otherRunning
    const ending = other ? (page.kind === 'evaluation' ? ' — ends the demo run first' : ' — ends the evaluation first') : ''
    const disabled = busy || state.stopping
    if (page.kind === 'evaluation') {
      return (
        <div className="flex items-center gap-1.5">
          <Button
            primary
            onClick={() => {
              goHome()
              void (other ? runControl.replaceWithEvaluation(page.scenario) : runControl.startEvaluation(page.scenario))
            }}
            disabled={disabled}
            label={state.stopping ? 'Stopping' : 'Start'}
            title={`Start the evaluation — Trinetra vs VAC on ${page.scenarioLabel}${ending}`}
            icon={<Play size={13} aria-hidden />}
          />
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1.5">
        <Button
          primary
          onClick={() => {
            goHome()
            void (other ? runControl.replaceWithDemo(false, page.scenario) : runControl.start(false, page.scenario))
          }}
          disabled={disabled}
          label={state.stopping ? 'Stopping' : 'Start'}
          title={`Start a simulation of ${page.scenarioLabel} (headless — watch it on Overview)${ending}`}
          icon={<Play size={13} aria-hidden />}
        />
        <Button
          onClick={() => {
            goHome()
            void (other ? runControl.replaceWithDemo(true, page.scenario) : runControl.start(true, page.scenario))
          }}
          disabled={disabled}
          label=""
          title={`Start a simulation and open the SUMO window as well${ending}`}
          icon={<Monitor size={13} aria-hidden />}
        />
      </div>
    )
  }

  // python app.py hosts one run and can start nothing; with it over,
  // there is nothing left to drive.
  if (state.can_start || !state.running) return null

  const stopping = state.stopping
  const handing = state.handing_over === true

  return (
    <div className="flex items-center gap-1.5">
      <AnimatePresence mode="popLayout" initial={false}>
        {!stopping && (
          <motion.div
            key={state.paused ? 'resume' : 'pause'}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: DUR.tick, ease: EASE_OUT }}
          >
            <Button
              onClick={() => void (state.paused ? runControl.resume() : runControl.pause())}
              disabled={busy}
              label={state.paused ? 'Play' : 'Pause'}
              title={state.paused ? 'Resume the simulation' : 'Pause the simulation'}
              icon={state.paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
              primary={state.paused}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        onClick={() => void (state.managed ? runControl.stop() : runControl.halt())}
        disabled={busy || stopping}
        label={stopping ? 'Stopping' : 'Stop'}
        title={
          state.managed
            ? 'End this run — SUMO closes cleanly and you can start another'
            : 'End this run. This dashboard lives inside it, so it cannot be restarted from here'
        }
        icon={<Square size={13} aria-hidden />}
      />

      {/* Continue THIS run in a SUMO window. Not a restart: the run saves
          its state and resumes from it, so the same vehicles carry over. */}
      {state.managed && state.running && !state.gui && state.kind !== 'evaluation' && (
        <Button
          onClick={() => void runControl.openGui()}
          disabled={busy || stopping || handing}
          label={handing ? 'Opening' : ''}
          title="Open the SUMO window and carry this run into it — same vehicles, same signal, about two seconds to swap"
          icon={<Monitor size={13} aria-hidden />}
        />
      )}

      <SpeedControl speed={state.speed} disabled={busy} />
    </div>
  )
}

/**
 * Tap to step through the speeds, or hover for the slider. The slider is
 * inside the hover wrapper so moving onto it does not dismiss it.
 */
function SpeedControl({ speed, disabled }: { speed: number | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const index = speedIndex(speed)
  const next = SPEEDS[(index + 1) % SPEEDS.length]

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Button
        onClick={() => void runControl.setSpeed(next)}
        disabled={disabled}
        label={speedLabel(speed)}
        title={`Simulated seconds per real second — click for ${speedLabel(next)}, or hover to slide`}
        icon={<Gauge size={13} aria-hidden />}
        mono
      />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: DUR.tick, ease: EASE_OUT }}
            className="absolute right-0 top-full z-20 mt-1.5 flex items-center gap-2 rounded-control border border-rule bg-plate px-3 py-2 shadow-[var(--shadow-panel)]"
          >
            <span className="num text-[11px] text-ink-mute">0.25×</span>
            <input
              type="range"
              min={0}
              max={SPEEDS.length - 1}
              step={1}
              value={index}
              disabled={disabled}
              aria-label="Simulation speed"
              onChange={(e) => void runControl.setSpeed(SPEEDS[Number(e.target.value)])}
              className="h-1.5 w-[132px] cursor-pointer appearance-none rounded-full bg-inset accent-[var(--ink-strong)]"
              style={{ accentColor: 'var(--ink-strong)' }}
            />
            <span className="num text-[11px] text-ink-mute">max</span>
            <span className="num w-[34px] text-right text-[12px] font-semibold text-ink-strong">
              {speedLabel(speed)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Button({
  onClick,
  disabled,
  label,
  title,
  icon,
  primary,
  mono,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  title: string
  icon: React.ReactNode
  primary?: boolean
  /** Numeric labels only — words belong in the UI face, not the mono one. */
  mono?: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      aria-label={label || title}
      title={title}
      className={clsx(
        'flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-[12.5px] font-semibold transition-colors',
        disabled && 'cursor-not-allowed opacity-50',
        primary
          ? 'border-[var(--bar-ink)] bg-[var(--bar-ink)] text-[var(--ink-on-dark)]'
          : 'border-[var(--bar-rule)] text-[var(--bar-ink)] hover:bg-[rgb(36_26_16/0.12)]',
      )}
    >
      {icon}
      {label && <span className={mono ? 'num' : undefined}>{label}</span>}
    </motion.button>
  )
}
