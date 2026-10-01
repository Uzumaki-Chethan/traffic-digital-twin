import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CARD_W } from './explainLayout'
import type { Explainer, LiveFacts } from './catalogue'

/**
 * The explainer (spec §7.1.4): a dialog with the title, 1–5 plain steps
 * (Back/Next, progress dots), the live example line while a run is up,
 * and "Got it!". Closes on Esc, a click outside, or the button. Focus is
 * trapped inside and returned on close. It never touches the simulation.
 */
export function ExplainerCard({ explainer, at, getFacts, onClose }: { explainer: Explainer; at: { left: number; top: number }; getFacts: () => LiveFacts; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [facts, setFacts] = useState(getFacts)
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  useLayoutEffect(() => {
    closeRef.current = onClose
  })
  const n = explainer.steps.length
  const lastStep = step >= n - 1

  useEffect(() => {
    const id = window.setInterval(() => setFacts(getFacts()), 1000)
    return () => window.clearInterval(id)
  }, [getFacts])

  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.querySelector<HTMLElement>('[data-primary]')?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
      } else if (e.key === 'Tab' && ref.current) {
        const fs = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
        if (!fs.length) return
        const i = fs.indexOf(document.activeElement as HTMLElement)
        const j = e.shiftKey ? (i <= 0 ? fs.length - 1 : i - 1) : i === fs.length - 1 ? 0 : i + 1
        e.preventDefault()
        fs[j].focus()
      }
    }
    const outside = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (t && !ref.current?.contains(t) && !t.closest('[data-blinky]')) closeRef.current()
    }
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerdown', outside, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', outside, true)
      prev?.focus()
    }
  }, [])

  const live = explainer.live?.(facts) ?? null
  return (
    <motion.div
      data-blinky
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="blinky-card"
      style={{ left: at.left, top: at.top, width: CARD_W }}
      initial={{ opacity: 0, scale: 0.92, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="font-display text-[17px] font-bold tracking-wide text-white">
          {explainer.title}
        </h2>
        <button type="button" aria-label="Close" onClick={onClose} className="fx-btn fx-dark -mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-white/80">
          ×
        </button>
      </div>
      <p key={step} className="blinky-step mt-3 min-h-[66px] text-[14px] leading-relaxed text-white/90">
        {explainer.steps[step]}
      </p>
      {live && (
        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-[12.5px] text-white/90">
          <span className="font-semibold text-[#2af28e]">Right now: </span>
          {live}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${n}`}>
          {explainer.steps.map((_, i) => (
            <span key={i} className="h-2 w-2 rounded-full" style={{ background: i === step ? ['#ff3b47', '#ffb020', '#2af28e'][i % 3] : 'rgb(255 255 255 / 0.3)' }} />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} className="fx-btn fx-dark rounded-full px-3.5 py-1.5 text-[13px] text-white">
              Back
            </button>
          )}
          {lastStep ? (
            <button type="button" data-primary onClick={onClose} className="run-go rounded-full px-4 py-1.5 text-[13px] font-semibold">
              Got it!
            </button>
          ) : (
            <button type="button" data-primary onClick={() => setStep(step + 1)} className="run-go rounded-full px-4 py-1.5 text-[13px] font-semibold">
              Next
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
