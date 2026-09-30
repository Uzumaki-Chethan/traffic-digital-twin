import { useEffect, useRef } from 'react'

/**
 * The pointer as a small signal head. Red while the mouse rests, green
 * while it moves, amber while a button is held; the housing turns gold and
 * grows a little over anything clickable, and it leans into fast sideways
 * moves. A click leaves a brief amber ripple. No glow trails it (the
 * owner's call, 2026-09-30).
 *
 * Mouse and pen only: on a touch screen, or with reduced motion asked for
 * (where the lean would be motion for its own sake), the
 * system cursor stays and none of this mounts. Text fields get the normal
 * I-beam back, since a signal head is no way to place a caret.
 */
const CLICKABLE = 'a,button,select,input,label[for],[role="button"],[data-clickable]'
const TEXT_ENTRY = 'input[type="text"],input[type="search"],input[type="number"],textarea'

export function TrafficCursor() {
  const head = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = head.current
    if (!el) return
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const root = document.documentElement
    root.classList.add('tc-on')

    let x = -200
    let y = -200
    let px = -200
    let last = 0
    let down = false
    let state = ''
    let tilt = 0
    let tv = 0
    let raf = 0

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      x = e.clientX
      y = e.clientY
      last = performance.now()
      const t = e.target as Element | null
      el.classList.toggle('ui', !!t?.closest?.(CLICKABLE))
      el.classList.toggle('gone', !!t?.closest?.(TEXT_ENTRY))
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      down = true
      const r = document.createElement('div')
      r.className = 'tc-ripple'
      r.style.left = `${e.clientX}px`
      r.style.top = `${e.clientY}px`
      ;(document.fullscreenElement ?? document.body).appendChild(r)
      setTimeout(() => r.remove(), 650)
    }
    const onUp = () => {
      down = false
    }
    const onLeave = () => el.classList.add('gone')
    const onEnter = () => el.classList.remove('gone')
    // Fullscreen shows only one element's subtree: carry the cursor into it.
    const onFs = () => {
      const host = document.fullscreenElement ?? document.body
      host.appendChild(el)
    }

    const frame = (now: number) => {
      const s = down ? 'amber' : now - last > 140 ? 'red' : 'green'
      if (s !== state) {
        state = s
        el.dataset.s = s
      }
      const vx = x - px
      px = x
      const target = Math.max(-16, Math.min(16, vx * 0.9))
      tv = (tv + (target - tilt) * 0.2) * 0.7
      tilt += tv
      el.style.transform = `translate3d(${x - 8}px, ${y - 2}px, 0) rotate(${tilt.toFixed(2)}deg)`
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerdown', onDown, { passive: true })
    addEventListener('pointerup', onUp)
    addEventListener('blur', onUp)
    document.addEventListener('mouseleave', onLeave)
    document.addEventListener('mouseenter', onEnter)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      cancelAnimationFrame(raf)
      root.classList.remove('tc-on')
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerdown', onDown)
      removeEventListener('pointerup', onUp)
      removeEventListener('blur', onUp)
      document.removeEventListener('mouseleave', onLeave)
      document.removeEventListener('mouseenter', onEnter)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [])

  return (
    <>
      <div ref={head} aria-hidden className="tc-head" data-s="red">
        <svg width="40" height="52" viewBox="-8 -2 40 52">
          <g className="tc-body">
            <g transform="rotate(-24) translate(0 -6.7)">
              <rect className="tc-housing" x="-6" y="6.7" width="12" height="27.4" rx="3.2" fill="#0A0D12" stroke="#8C97A6" strokeWidth="1.2" />
              <circle className="tc-lamp tc-r" cx="0" cy="12.4" r="3.2" />
              <circle className="tc-lamp tc-a" cx="0" cy="20.4" r="3.2" />
              <circle className="tc-lamp tc-g" cx="0" cy="28.4" r="3.2" />
              <rect x="-1.15" y="34.1" width="2.3" height="8.6" fill="#8C97A6" />
              <rect x="-4.2" y="42.4" width="8.4" height="2.2" rx="1.1" fill="#8C97A6" />
            </g>
          </g>
        </svg>
      </div>
    </>
  )
}
