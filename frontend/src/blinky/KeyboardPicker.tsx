import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { allTargets, targetLabel, type Target } from './targets'
import { TargetHighlight } from './TargetHighlight'

/**
 * Pointer-free "Explain…" mode (spec §7.1.6): Tab / Shift+Tab walk every
 * explainable thing in reading order, Enter explains it, Esc stops.
 */
export function KeyboardPicker({ onPick, onCancel }: { onPick: (t: Target) => void; onCancel: () => void }) {
  const [targets] = useState(allTargets)
  const [i, setI] = useState(0)
  const cbs = useRef({ onPick, onCancel })
  useLayoutEffect(() => {
    cbs.current = { onPick, onCancel }
  })
  const cur: Target | undefined = targets[i]

  useEffect(() => {
    if (!targets.length) cbs.current.onCancel()
  }, [targets])

  useEffect(() => {
    cur?.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [cur])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        setI((v) => (v + (e.shiftKey ? -1 : 1) + targets.length) % targets.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (cur) cbs.current.onPick(cur)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cbs.current.onCancel()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [targets, cur])

  if (!cur) return null
  const label = targetLabel(cur.id)
  return (
    <>
      <TargetHighlight el={cur.el} label={label} />
      <div data-blinky className="blinky-hint" aria-live="polite">
        <b>{label}</b> · Enter: explain · Tab: next · Esc: stop
      </div>
    </>
  )
}
