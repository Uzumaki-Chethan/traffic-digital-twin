import { useEffect, useState, type RefObject } from 'react'

/**
 * Where the dock sits: in the rail's empty space under the page links,
 * just above the tagline — over nothing. When the rail is too short for
 * that, the page frame's bottom-left corner instead.
 */
function useDockSpot(): { left: number; bottom: number } {
  const [c, setC] = useState({ left: 36, bottom: 140 })
  useEffect(() => {
    const aside = document.querySelector('aside')
    const nav = aside?.querySelector('nav')
    const main = document.querySelector('main')
    if (!aside || !nav || !main) return
    const read = () => {
      const a = aside.getBoundingClientRect()
      const n = nav.getBoundingClientRect()
      const links = nav.querySelectorAll('a')
      const lastLink = links.length ? links[links.length - 1].getBoundingClientRect().bottom : n.top
      if (n.bottom - lastLink > 80) setC({ left: a.left + 18, bottom: window.innerHeight - n.bottom + 8 })
      else {
        const m = main.getBoundingClientRect()
        setC({ left: m.left + 12, bottom: window.innerHeight - m.bottom + 12 })
      }
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(aside)
    ro.observe(nav)
    window.addEventListener('resize', read)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', read)
    }
  }, [])
  return c
}

/**
 * Blinky's corner controls (spec §8), low in the rail (see useDockSpot): a
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
  const at = useDockSpot()
  return (
    <div data-blinky className="blinky-dock" style={{ left: at.left, bottom: at.bottom }} role="toolbar" aria-label="Zen">
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
