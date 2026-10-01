import { useEffect, useState, type RefObject } from 'react'

function useMainCorner(): { left: number; bottom: number } {
  const [c, setC] = useState({ left: 300, bottom: 70 })
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const read = () => {
      const r = main.getBoundingClientRect()
      setC({ left: r.left + 12, bottom: window.innerHeight - r.bottom + 12 })
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(main)
    window.addEventListener('resize', read)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', read)
    }
  }, [])
  return c
}

/**
 * Blinky's corner controls (spec §8), bottom-left of the page frame: a
 * round badge (where Blinky sits when docked) and four buttons that slide
 * out on hover or keyboard focus — Shh/Wake, Sound, Come here, Explain…
 */
export function Dock({
  badgeRef,
  asleep,
  sound,
  picking,
  onSleep,
  onSound,
  onCome,
  onExplain,
}: {
  badgeRef: RefObject<HTMLDivElement | null>
  asleep: boolean
  sound: boolean
  picking: boolean
  onSleep: () => void
  onSound: () => void
  onCome: () => void
  onExplain: () => void
}) {
  const at = useMainCorner()
  return (
    <div data-blinky className="blinky-dock" style={{ left: at.left, bottom: at.bottom }} role="toolbar" aria-label="Blinky">
      <div ref={badgeRef} className="blinky-badge" aria-hidden />
      <div className="blinky-tools">
        <button type="button" className="fx-btn fx-dark" aria-pressed={asleep} onClick={onSleep}>
          {asleep ? 'Wake' : 'Shh'}
        </button>
        <button type="button" className="fx-btn fx-dark" aria-pressed={sound} onClick={onSound}>
          {sound ? 'Sound on' : 'Sound off'}
        </button>
        <button type="button" className="fx-btn fx-dark" onClick={onCome} disabled={asleep}>
          Come here
        </button>
        <button type="button" className="fx-btn fx-dark" aria-pressed={picking} onClick={onExplain}>
          Explain…
        </button>
      </div>
    </div>
  )
}
