import { useEffect, useRef } from 'react'

/**
 * The red→amber→green outline and name tag around an explain target. It
 * follows the element every frame (so scrolling keeps it on), and takes no
 * pointer events.
 */
export function TargetHighlight({ el, label }: { el: Element; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const b = box.current
      if (b) {
        const r = el.getBoundingClientRect()
        b.style.transform = `translate(${r.left - 4}px, ${r.top - 4}px)`
        b.style.width = `${r.width + 8}px`
        b.style.height = `${r.height + 8}px`
        b.style.opacity = el.isConnected ? '1' : '0'
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [el])
  return (
    <div data-blinky ref={box} className="blinky-highlight">
      <span className="blinky-tag">{label}</span>
    </div>
  )
}
