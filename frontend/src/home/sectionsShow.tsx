import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowRight, ArrowUp, Ambulance, CloudRain, Cpu, Lightbulb, Monitor, Scale, ShieldCheck, TrafficCone, Waves } from 'lucide-react'
import { ScenarioPreview } from '@/settings/ScenarioPreview'
import eye from '@/assets/trinetra-eye.png'
import { EVAL_SCENARIOS } from '@/data/scenarios'
import shotOverview from '@/assets/home/overview.webp'
import shotPerformance from '@/assets/home/performance.webp'
import shotAnalytics from '@/assets/home/analytics.webp'
import shotDecisions from '@/assets/home/decisions.webp'
import shotSettings from '@/assets/home/settings.webp'
import { CONSOLE_PAGES, RESILIENCE, RESULTS, SCENARIO_GROUPS, STACK } from './content'

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useScene(ref: React.RefObject<HTMLElement | null>, build: (el: HTMLElement) => void) {
  useEffect(() => {
    const el = ref.current
    if (!el || reduced()) return
    const ctx = gsap.context(() => build(el), el)
    return () => ctx.revert()
    // the scene is built once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// ---------------------------------------------------------------- built for the unexpected

const RES_ICON = { emergency: Ambulance, accident: TrafficCone, rain: CloudRain, rush: Waves, fair: Scale, safe: ShieldCheck } as const

export function Resilience() {
  const ref = useRef<HTMLElement>(null)
  useScene(ref, () => {
    gsap.fromTo(
      '.res-slot',
      { opacity: 0, y: 90, rotate: (i: number) => (i % 2 ? 4 : -4) },
      { opacity: 1, y: 0, rotate: 0, stagger: 0.1, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.res-grid', start: 'top 80%' } },
    )
  })
  return (
    <section ref={ref} className="home-section" id="unexpected">
      <div className="home-wrap">
        <p className="home-eyebrow" data-reveal>
          Built for the unexpected
        </p>
        <h2 className="home-h2" data-reveal>
          Real roads don’t run <span className="grad">to plan.</span>
        </h2>
        <div className="res-grid">
          {RESILIENCE.map((r) => {
            const Icon = RES_ICON[r.key]
            return (
              <div key={r.key} className="res-slot">
                <article className={`res-card fx-${r.key}`}>
                  <div className="res-fx" aria-hidden>
                    <Icon size={30} />
                    <span className="fx-layer" />
                  </div>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                </article>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- scenarios

const DEMAND_LABEL = { light: 'Light', moderate: 'Moderate', heavy: 'Heavy', ramping: 'Ramping' } as const

export function Scenarios() {
  const ref = useRef<HTMLElement>(null)
  useScene(ref, (el) => {
    el.querySelectorAll('.scn-group').forEach((g, i) => {
      gsap.fromTo(
        g.querySelectorAll('.scn-slot'),
        { opacity: 0, x: i % 2 ? 140 : -140 },
        { opacity: 1, x: 0, stagger: 0.1, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: g, start: 'top 78%' } },
      )
    })
  })
  const byId = new Map(EVAL_SCENARIOS.map((s) => [s.id, s]))
  const resultOf = new Map(RESULTS.map((r) => [r.id, r]))
  return (
    <section ref={ref} className="home-section" id="scenarios">
      <div className="home-wrap">
        <p className="home-eyebrow" data-reveal>
          Thirteen scenarios
        </p>
        <h2 className="home-h2" data-reveal>
          Every kind of day, <span className="grad">tested.</span>
        </h2>
        <p className="home-lead" data-reveal>
          Each one is a full traffic simulation you can run from the console — watch the AI on its own, or race it against the vehicle-actuated signal. Under each: how Trinetra did against that signal.
        </p>
        {SCENARIO_GROUPS.map((g, gi) => (
          <div key={g.title} className="scn-group">
            <div className="scn-head" data-reveal>
              <span className="scn-idx">{String(gi + 1).padStart(2, '0')}</span>
              <div>
                <h3>{g.title}</h3>
                <p>{g.line}</p>
              </div>
            </div>
            <div className="scn-row">
              {g.ids.map((id, i) => {
                const s = byId.get(id)
                if (!s) return null
                const res = resultOf.get(id)
                return (
                  <div key={id} className="scn-slot">
                    <Link to="/settings" className="scn-card" aria-label={`${s.name} — open Simulation Settings`}>
                      <div className="scn-preview">
                        <ScenarioPreview id={id} seed={gi * 10 + i + 1} />
                      </div>
                      <div className="scn-body">
                        <div className="flex items-center justify-between gap-2">
                          <h4>{s.name}</h4>
                          <span className={`scn-tag tag-${s.demand}`}>{DEMAND_LABEL[s.demand]}</span>
                        </div>
                        <p>{s.blurb}</p>
                        {res && (
                          <div className="scn-result">
                            <span>
                              <b>{res.wait.toFixed(1)}%</b> less waiting
                            </span>
                            <span>
                              <b>{res.wins}/7</b> measures
                            </span>
                          </div>
                        )}
                      </div>
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- console tour

const SHOTS: Record<string, string> = {
  overview: shotOverview,
  performance: shotPerformance,
  analytics: shotAnalytics,
  decisions: shotDecisions,
  settings: shotSettings,
}

export function ConsoleTour() {
  const ref = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const triggers = [...el.querySelectorAll('.tour-step')].map((step, i) =>
      ScrollTrigger.create({ trigger: step, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => self.isActive && setActive(i) }),
    )
    return () => triggers.forEach((t) => t.kill())
  }, [])
  useScene(ref, () => {
    gsap.fromTo(
      '.tour-frame',
      { rotateX: 22, rotateY: -14, scale: 0.88, opacity: 0.4 },
      { rotateX: 0, rotateY: 0, scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: '.tour', start: 'top bottom', end: 'top 30%', scrub: 0.6 } },
    )
  })
  return (
    <section ref={ref} className="home-section" id="console">
      <div className="home-wrap">
        <p className="home-eyebrow" data-reveal>
          Inside the console
        </p>
        <h2 className="home-h2" data-reveal>
          Five pages. <span className="grad">Everything in the open.</span>
        </h2>
        <div className="tour">
          <div className="tour-steps">
            {CONSOLE_PAGES.map((p, i) => (
              <div key={p.key} className={`tour-step ${active === i ? 'on' : ''}`}>
                <div className="tour-card">
                  <span className="tour-num">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{p.name}</h3>
                  <p className="tour-line">{p.line}</p>
                  <ul>
                    {p.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                  <img src={SHOTS[p.key]} alt="" className="tour-inline" loading="lazy" />
                  <Link to={p.path} className="tour-link">
                    Open {p.name} <ArrowRight size={14} aria-hidden />
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <div className="tour-screen">
            <div className="tour-frame">
              <div className="tour-bar" aria-hidden>
                <i />
                <i />
                <i />
                <span>{CONSOLE_PAGES[active].name}</span>
                <b className="tour-dots">
                  {CONSOLE_PAGES.map((p, i) => (
                    <em key={p.key} className={i === active ? 'on' : ''} />
                  ))}
                </b>
              </div>
              <div className="tour-shots">
                {CONSOLE_PAGES.map((p, i) => (
                  <img key={p.key} src={SHOTS[p.key]} alt={`The ${p.name} page`} className={active === i ? 'on' : ''} loading="lazy" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- the physical model

/** The combined left+ahead arrow, from the hardware handoff's Appendix B (the acrylic aperture's own outline). */
const COMBINED = '-0.08,-0.45 0.08,-0.45 0.08,0.16 0.22,0.16 0,0.5 -0.22,0.16 -0.08,0.16 -0.08,0.03 -0.34,0.03 -0.34,0.15 -0.55,-0.05 -0.34,-0.25 -0.34,-0.13 -0.08,-0.13'
const RIGHT = '-0.4,-0.08 0.12,-0.08 0.12,-0.24 0.45,0 0.12,0.24 0.12,0.08 -0.4,0.08'

type Lamp = 'R' | 'A' | 'G' | '0'
/** A head's four lenses through one cycle — the same rule the rig and the 3D view use. */
const SEQ: [Lamp, Lamp, Lamp, Lamp][] = [
  ['0', '0', 'G', 'R'], // left + ahead green, right still red
  ['0', '0', 'A', 'R'],
  ['R', '0', '0', '0'], // nothing green: one red circle
  ['0', '0', 'R', 'G'], // the right turn's own green
  ['0', 'A', '0', '0'], // its green just ended: the amber circle
  ['R', '0', '0', '0'],
]
const COLOUR: Record<Lamp, string> = { R: '#ff2b20', A: '#ffb300', G: '#38e070', '0': '#1b1f28' }

const LENS_LABELS = ['Red · shared by every movement', 'Amber · shared', 'Left + ahead · one arrow', 'Right turn · its own arrow']
const LENS_Y = [60, 146, 232, 318]

function SignalHead({ phase }: { phase: number }) {
  const lamps = SEQ[phase % SEQ.length]
  const glow = (l: Lamp) => (l === '0' ? undefined : `drop-shadow(0 0 8px ${COLOUR[l]}) drop-shadow(0 0 18px ${COLOUR[l]})`)
  return (
    <svg viewBox="0 0 400 380" className="rig-head" role="img" aria-label="A four-lens signal head: red, amber, a combined left-and-ahead arrow, and a right arrow">
      <rect x="6" y="6" width="108" height="368" rx="22" fill="#0b0e15" stroke="#2a3346" strokeWidth="3" />
      <circle cx="60" cy="60" r="34" fill={COLOUR[lamps[0]]} style={{ filter: glow(lamps[0]), transition: 'fill .35s' }} />
      <circle cx="60" cy="146" r="34" fill={COLOUR[lamps[1]]} style={{ filter: glow(lamps[1]), transition: 'fill .35s' }} />
      <circle cx="60" cy="232" r="36" fill="#05070b" />
      <polygon points={COMBINED} transform="translate(64 232) scale(58 -58)" fill={COLOUR[lamps[2]]} style={{ filter: glow(lamps[2]), transition: 'fill .35s' }} />
      <circle cx="60" cy="318" r="36" fill="#05070b" />
      <polygon points={RIGHT} transform="translate(58 318) scale(58 -58)" fill={COLOUR[lamps[3]]} style={{ filter: glow(lamps[3]), transition: 'fill .35s' }} />
      {LENS_LABELS.map((t, i) => (
        <g key={t} className="rig-call">
          <path d={`M100 ${LENS_Y[i]} H150 L165 ${LENS_Y[i] - 14} H392`} className="rig-call-line" pathLength={1} />
          <circle cx={100} cy={LENS_Y[i]} r={3} fill="#ffb020" />
          <text x={168} y={LENS_Y[i] - 22} className="rig-call-text">
            {t}
          </text>
        </g>
      ))}
    </svg>
  )
}

function RigChain() {
  return (
    <div className="rig-chain" aria-label="Console, then a USB cable, then the ESP32 board, then the four signal heads">
      <span className="rig-node">
        <Monitor size={18} aria-hidden /> Console
      </span>
      <span className="rig-wire" aria-hidden>
        <i />
        <em>USB</em>
      </span>
      <span className="rig-node">
        <Cpu size={18} aria-hidden /> ESP32
      </span>
      <span className="rig-wire" aria-hidden>
        <i />
        <em>LEDs</em>
      </span>
      <span className="rig-node">
        <Lightbulb size={18} aria-hidden /> 4 heads · 16 lamps
      </span>
    </div>
  )
}

export function Rig() {
  const ref = useRef<HTMLElement>(null)
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (reduced()) return
    const id = window.setInterval(() => setPhase((p) => p + 1), 1500)
    return () => window.clearInterval(id)
  }, [])
  useScene(ref, () => {
    gsap.fromTo('.rig-head', { opacity: 0, y: 120, rotateY: 50 }, { opacity: 1, y: 0, rotateY: 0, duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: '.rig', start: 'top 75%' } })
    gsap.fromTo('.rig-call-line', { strokeDashoffset: 1 }, { strokeDashoffset: 0, stagger: 0.18, duration: 1.1, ease: 'power2.inOut', scrollTrigger: { trigger: '.rig', start: 'top 60%' } })
    gsap.fromTo('.rig-call-text', { opacity: 0, x: -14 }, { opacity: 1, x: 0, stagger: 0.18, duration: 0.8, delay: 0.5, ease: 'power2.out', scrollTrigger: { trigger: '.rig', start: 'top 60%' } })
  })
  return (
    <section ref={ref} className="home-section" id="rig">
      <div className="home-wrap rig">
        <div>
          <p className="home-eyebrow" data-reveal>
            From screen to street
          </p>
          <h2 className="home-h2" data-reveal>
            A real junction <span className="grad">you can hold.</span>
          </h2>
          <p className="home-lead" data-reveal>
            A scale model of the same junction in acrylic, with four signal heads and sixteen LEDs. An ESP32 board receives the AI’s live decisions over a USB cable and lights each head exactly as the simulation does.
          </p>
          <ul className="rig-points" data-reveal>
            <li>
              <b>Four lenses per head:</b> a red circle, an amber circle, one combined left-and-ahead arrow, and a right arrow.
            </li>
            <li>
              <b>Live:</b> the lights follow the simulation five times a second.
            </li>
            <li>
              <b>Fail-safe:</b> if the link drops, every head blinks amber — like a real signal in fault mode.
            </li>
          </ul>
          <RigChain />
        </div>
        <div className="rig-stage">
          <SignalHead phase={phase} />
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- finale

export function Finale({ onTop }: { onTop: () => void }) {
  const ref = useRef<HTMLElement>(null)
  useScene(ref, () => {
    gsap.fromTo(
      '.finale-title',
      { opacity: 0, scale: 0.7, filter: 'blur(14px)' },
      { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 1.4, ease: 'power4.out', scrollTrigger: { trigger: '.finale-title', start: 'top 85%' } },
    )
  })
  return (
    <section ref={ref} className="home-finale" id="start">
      <div className="stack-marquee" aria-label="Built with">
        <div className="stack-track">
          {[...STACK, ...STACK].map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
      </div>
      <div className="home-wrap finale-inner">
        <h2 className="finale-title">
          Watch it <span className="grad">think.</span>
        </h2>
        <p className="home-lead">Start a simulation, pick a scenario, send an ambulance — and see every decision the AI makes, as it makes it.</p>
        <Link to="/overview" className="home-cta big">
          Open the console <ArrowRight size={20} aria-hidden />
        </Link>
      </div>
      <footer className="home-wrap home-foot">
        <div className="foot-brand">
          <img src={eye} alt="" />
          <div>
            <b>TRINETRA</b>
            <span>Smarter Signals · Safer Cities</span>
          </div>
        </div>
        <nav aria-label="Console pages">
          {CONSOLE_PAGES.map((p) => (
            <Link key={p.key} to={p.path}>
              {p.name}
            </Link>
          ))}
        </nav>
        <button type="button" className="foot-top" onClick={onTop}>
          Back to top <ArrowUp size={14} aria-hidden />
        </button>
      </footer>
    </section>
  )
}
