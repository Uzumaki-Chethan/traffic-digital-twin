import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Director, REST_SIZE, type Align, type Ui } from './director'
import { readWorld } from './worldDom'
import { useLiveState } from './useLiveState'
import { loadPrefs, savePrefs, type BlinkyPrefs } from './prefs'
import { chirp } from './sound'
import { Blinky3D, emptyOrbSpots } from './Blinky3D'
import { ORB_COUNT } from './model'
import { Bubble } from './Bubble'
import { OrbGuide } from './OrbGuide'
import { ExplainerCard } from './ExplainerCard'
import { KeyboardPicker } from './KeyboardPicker'
import { TargetHighlight } from './TargetHighlight'
import { Dock } from './Dock'
import { targetLabel, type Target } from './targets'
import { liveFactsFor, type Explainer } from './catalogue'
import type { Vec } from './types'

interface Open {
  explainer: Explainer
  at: { left: number; top: number }
  target: Target | null
  key: number
}

const nowS = () => performance.now() / 1000
/** Size of each orb's grab handle (px). */
const ORB_HIT = 30

/**
 * Blinky (Section 38): mounted once in Shell, outside the routes. Owns the
 * rAF loop that feeds the Director and writes Blinky's wrapper transform
 * directly; React state only for the occasional UI (bubble, explainer,
 * orb drag, keyboard picker, dock). Strictly read-only towards the run.
 */
export function BlinkyRoot() {
  const { pathname } = useLocation()
  const live = useLiveState()
  const [prefs, setPrefs] = useState<BlinkyPrefs>(loadPrefs)
  const prefsRef = useRef(prefs)
  const routeRef = useRef(pathname)
  const [size, setSize] = useState(REST_SIZE)
  const [bubble, setBubble] = useState<{ text: string; id: number; align: Align } | null>(null)
  const [open, setOpen] = useState<Open | null>(null)
  // The orb being dragged to explain something (Section 40), and where it was grabbed.
  const [drag, setDrag] = useState<{ orb: number; start: Vec } | null>(null)
  const orbsRef = useRef(emptyOrbSpots())
  const orbEls = useRef<(HTMLDivElement | null)[]>([])
  const [picking, setPicking] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const [{ director, clearBubble }] = useState(() => {
    // Closure state, not refs: the bubble's hide timer and a key counter.
    let timer = 0
    let n = 0
    const ui: Ui = {
      setSize,
      say: (text, align, ms) => {
        window.clearTimeout(timer)
        setBubble({ text, align, id: ++n })
        timer = window.setTimeout(() => setBubble(null), ms)
      },
      openExplain: (e) => setOpen({ ...e, key: ++n }),
    }
    return { director: new Director(ui), clearBubble: () => window.clearTimeout(timer) }
  })

  // One stable ref for the 3D canvas: a fresh object each render re-ran its
  // GL effect and rebuilt the renderer on every re-render (review #1).
  const poseRef = useRef(director.pose)
  const [dead, setDead] = useState(false)

  useEffect(() => {
    routeRef.current = pathname
  }, [pathname])

  // Dev-only handle for browser verification (stripped from production builds).
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { blinkyDebug?: Director }).blinkyDebug = director
  }, [director])

  useEffect(() => {
    let raf = 0
    let world = readWorld()
    let lastRead = performance.now()
    let lastRoute = routeRef.current
    let last = performance.now()
    let pointer: Vec | null = null
    let lastMove = performance.now()
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY }
      lastMove = performance.now()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    const frame = () => {
      try {
        step()
      } catch (err) {
        // A throw here would repeat every frame and never reach the
        // ErrorBoundary: stop Blinky instead, leave the console alone.
        console.error('[Blinky] stopped:', err)
        director.interrupt()
        setDead(true)
        return
      }
      raf = requestAnimationFrame(frame)
    }
    const step = () => {
      const ms = performance.now()
      if (ms - lastRead > 300 || routeRef.current !== lastRoute) {
        world = readWorld()
        lastRead = ms
        lastRoute = routeRef.current
      }
      const b = badgeRef.current?.getBoundingClientRect()
      director.tick({
        now: ms / 1000,
        dt: Math.min(0.1, (ms - last) / 1000),
        world,
        live: live.current,
        route: routeRef.current,
        pointer,
        idleSeconds: (ms - lastMove) / 1000,
        docked: prefsRef.current.asleep,
        sound: prefsRef.current.sound,
        reducedMotion: mq.matches,
        dock: b ? { x: b.left + b.width / 2, y: b.bottom - 6 } : null,
      })
      last = ms
      const el = wrapRef.current
      if (el) {
        const s = director.size
        el.style.transform = `translate3d(${director.pos.x - 0.9 * s}px, ${director.pos.y - 1.4 * s}px, 0)`
        el.style.visibility = director.hidden ? 'hidden' : 'visible'
        el.style.clipPath = director.clip ?? ''
        // the orbs' grab handles follow the orbs as they circle
        orbsRef.current.forEach((o, i) => {
          const h = orbEls.current[i]
          if (!h) return
          h.style.transform = `translate(${o.x - ORB_HIT / 2}px, ${o.y - ORB_HIT / 2}px)`
          h.style.visibility = o.visible && !director.hidden ? 'visible' : 'hidden'
        })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      clearBubble()
      director.interrupt()
    }
  }, [director, live, clearBubble])

  const updatePrefs = (p: BlinkyPrefs) => {
    prefsRef.current = p
    setPrefs(p)
    savePrefs(p)
  }

  const closeExplain = useCallback(() => {
    setOpen(null)
    director.endPresent()
  }, [director])

  const onDrop = useCallback((t: Target | null) => director.dropAntenna(t, nowS()), [director])
  const onOrbHome = useCallback(() => {
    director.holdOrb(null)
    setDrag(null)
  }, [director])
  // Where the held orb's place in Zen's orbit is on screen right now.
  const orbHome = (i: number) => (): Vec => {
    const w = wrapRef.current?.getBoundingClientRect()
    const o = orbsRef.current[i]
    return w ? { x: w.left + o.x, y: w.top + o.y } : { x: 0, y: 0 }
  }
  // Read only when called (the explainer's 1 s refresh), never during render.
  const getFacts = () => liveFactsFor(live.current.facts, live.current.run.running)

  if (dead) return null

  return (
    <>
      <div data-blinky ref={wrapRef} className="blinky-layer" style={{ width: 1.8 * size, height: 1.8 * size }}>
        <Blinky3D poseRef={poseRef} size={size} orbsRef={orbsRef} />
        <Bubble text={bubble?.text ?? null} id={bubble?.id ?? 0} align={bubble?.align ?? 'center'} size={size} />
        <div
          className="blinky-hit"
          role="img"
          aria-label="Zen, the guide bot"
          style={{ left: 0.6 * size, top: 0.42 * size, width: 0.6 * size, height: 0.95 * size }}
          onPointerDown={(e) => {
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              // no capturable pointer (synthetic events) — a tap still works
            }
            director.bodyDown({ x: e.clientX, y: e.clientY })
          }}
          onPointerMove={(e) => director.bodyMove({ x: e.clientX, y: e.clientY })}
          onPointerUp={() => director.bodyUp(nowS())}
          onPointerCancel={() => director.bodyUp(nowS())}
          onPointerEnter={() => director.hover(nowS())}
        />
        {Array.from({ length: ORB_COUNT }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              orbEls.current[i] = el
            }}
            className="blinky-ball"
            aria-hidden
            style={{ left: 0, top: 0, width: ORB_HIT, height: ORB_HIT }}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              if (drag) return
              if (open) closeExplain()
              setPicking(false)
              director.holdOrb(i)
              director.grabAntenna()
              setDrag({ orb: i, start: { x: e.clientX, y: e.clientY } })
            }}
          />
        ))}
      </div>
      {drag && <OrbGuide start={drag.start} getHome={orbHome(drag.orb)} onDrop={onDrop} onDone={onOrbHome} />}
      {open?.target && <TargetHighlight el={open.target.el} label={targetLabel(open.target.id)} />}
      {open && <ExplainerCard key={open.key} explainer={open.explainer} at={open.at} getFacts={getFacts} onClose={closeExplain} />}
      {picking && (
        <KeyboardPicker
          onPick={(t) => {
            setPicking(false)
            director.present(t, nowS())
          }}
          onCancel={() => setPicking(false)}
        />
      )}
      <Dock
        badgeRef={badgeRef}
        asleep={prefs.asleep}
        sound={prefs.sound}
        picking={picking}
        onSleep={() => updatePrefs({ ...prefs, asleep: !prefs.asleep })}
        onSound={() => {
          const sound = !prefs.sound
          updatePrefs({ ...prefs, sound })
          if (sound) chirp('hi', true)
        }}
        onCome={() => director.comeHere()}
        onExplain={() => setPicking((v) => !v)}
      />
    </>
  )
}
