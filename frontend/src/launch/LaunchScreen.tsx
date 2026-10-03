import { useSyncExternalStore } from 'react'
import eye from '@/assets/trinetra-eye.png'
import { getPhase, subscribe, type LaunchPhase } from './launch'
import './launch.css'

const LAMPS: { key: Exclude<LaunchPhase, 'idle' | 'out'>; word: string }[] = [
  { key: 'get', word: 'Get' },
  { key: 'set', word: 'Set' },
  { key: 'go', word: 'Go' },
]

/** Which lamp is lit: red, then amber, then green (green stays on as it fades). */
function lit(phase: LaunchPhase) {
  return phase === 'out' ? 'go' : phase
}

/**
 * The "Get, set, go" signal shown while the console loads (Section 49):
 * a three-lamp head lighting red, amber, green, each with its word.
 * Mounted once in App, above the routes; it renders nothing when idle.
 */
export function LaunchScreen() {
  const phase = useSyncExternalStore(subscribe, getPhase, getPhase)
  if (phase === 'idle') return null
  const on = lit(phase)
  return (
    <div className={`launch ${phase === 'out' ? 'launch-out' : ''}`} role="status" aria-live="polite">
      <img src={eye} alt="" className="launch-eye" />
      <div className="launch-head" aria-hidden>
        {LAMPS.map((l) => (
          <div key={l.key} className={`launch-row ${on === l.key ? 'on' : ''}`}>
            <span className={`launch-lamp lamp-${l.key}`} />
            <span className="launch-word">{l.word}</span>
          </div>
        ))}
      </div>
      <p className="launch-caption">{on === 'go' ? 'Opening the console' : 'Starting the console…'}</p>
    </div>
  )
}
