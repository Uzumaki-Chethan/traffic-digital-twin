import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { Activity, ArrowDown, ArrowRight, BrainCircuit, Car, ChevronDown, Eye, Repeat, ScanEye, TrendingUp, type LucideIcon } from 'lucide-react'
import eye from '@/assets/trinetra-eye.png'
import wordmark from '@/assets/trinetra-wordmark.png'
import { scenarioName } from '@/data/scenarios'
import { ProblemScene } from './ProblemScene'
import { DecidesViz, PredictsViz, SeesViz } from './PillarViz'
import { HEADLINES, PILLARS, PIPELINE, PREDICTION, RESULTS, type ResultRow } from './content'

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Run a GSAP scene scoped to `ref` (reverted on unmount); skipped under reduced motion. */
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

// ---------------------------------------------------------------- hero

export function Hero({ onMore }: { onMore: () => void }) {
  const ref = useRef<HTMLElement>(null)
  useScene(ref, (el) => {
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } })
    tl.from('.hero-eye', { scale: 0.2, opacity: 0, rotate: -40, duration: 1.6 })
      .from('.hero-word', { clipPath: 'inset(0 100% 0 0)', opacity: 0, duration: 1.4 }, '-=0.9')
      .from('.hero-tag span span, .hero-tag .dot', { y: 40, opacity: 0, stagger: 0.12, duration: 0.9 }, '-=0.7')
      .from('.hero-line', { y: 30, opacity: 0, filter: 'blur(8px)', duration: 1 }, '-=0.5')
      .from('.hero-actions', { y: 24, opacity: 0, duration: 0.8 }, '-=0.6')
      .from('.hero-facts li', { y: 16, opacity: 0, stagger: 0.08, duration: 0.6 }, '-=0.4')
      .from('.hero-cue', { opacity: 0, duration: 0.8 }, '-=0.3')
    // leaving the hero: it sinks back and fades as the page scrolls on
    gsap.to(el.querySelector('.hero-inner'), {
      scale: 0.82,
      opacity: 0,
      y: -80,
      ease: 'none',
      scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true },
    })
  })
  return (
    <section ref={ref} className="home-hero" id="top">
      <div className="hero-inner">
        <span className="hero-eye-float">
          <img src={eye} alt="" className="hero-eye" />
        </span>
        <img src={wordmark} alt="Trinetra" className="hero-word" />
        <p className="hero-tag">
          <span className="tag-pair">
            <span>Smarter</span> <span>Signals</span>
          </span>{' '}
          <span className="dot">·</span>{' '}
          <span className="tag-pair">
            <span>Safer</span> <span>Cities</span>
          </span>
        </p>
        <p className="hero-line">
          An AI that watches a road junction, predicts the next {PREDICTION.horizonSeconds} seconds of traffic, and decides — every second — who gets the green.
        </p>
        <div className="hero-actions">
          <Link to="/overview" className="home-cta">
            Open the console <ArrowRight size={18} aria-hidden />
          </Link>
          <button type="button" className="home-ghost" onClick={onMore}>
            See how it works
          </button>
        </div>
        <ul className="hero-facts">
          <li>
            <b>{HEADLINES.scenariosWon}/13</b> scenarios won
          </li>
          <li>
            <b>{PREDICTION.horizonSeconds}s</b> look-ahead
          </li>
          <li>
            <b>1</b> decision every second
          </li>
          <li>
            <b>{HEADLINES.bestWaitCut.toFixed(0)}%</b> less waiting, at best
          </li>
        </ul>
      </div>
      <button type="button" className="hero-cue" onClick={onMore} aria-label="Scroll down">
        <ArrowDown size={20} aria-hidden />
      </button>
    </section>
  )
}

// ---------------------------------------------------------------- the problem

const PROBLEM_1 = 'Most traffic lights still run on a clock.'
const split = (t: string) =>
  t.split(' ').map((w, i) => (
    <span key={i} className="pw">
      {w}{' '}
    </span>
  ))
const PROBLEM_2 = 'They hand a green to an empty road while a queue waits at red — every day, at every junction, for hours.'

export function Problem() {
  const ref = useRef<HTMLElement>(null)
  // with reduced motion the scene simply shows the problem itself
  const [p, setP] = useState(0.45)
  useScene(ref, (el) => {
    const words = el.querySelectorAll('.pw')
    setP(0)
    gsap
      .timeline({ scrollTrigger: { trigger: el, start: 'top top', end: '+=220%', scrub: 0.6, pin: true, onUpdate: (self) => setP(self.progress) } })
      .to(words, { color: '#ffffff', textShadow: '0 2px 4px rgba(0,0,0,0.6), 0 0 24px rgba(255,170,90,0.35)', stagger: { amount: 0.4 }, ease: 'none', duration: 0.05 }, 0)
      .to('.problem-answer', { opacity: 1, y: 0, ease: 'none', duration: 0.12 }, 0.62)
      .to({}, { duration: 0.26 })
  })
  return (
    <section ref={ref} className="home-problem" id="problem">
      <div className="home-wrap problem-grid">
        <div>
          <p className="home-eyebrow">The problem</p>
          <h2 className="problem-text">{split(PROBLEM_1)}</h2>
          <p className="problem-text small">{split(PROBLEM_2)}</p>
          <p className="problem-answer">
            Trinetra gives the green to <b>whoever actually needs it</b> — and can show you why.
          </p>
        </div>
        <ProblemScene p={p} />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- what it is

const PILLAR_ICON = { sees: Eye, predicts: TrendingUp, decides: BrainCircuit } as const
const PILLAR_VIZ = { sees: SeesViz, predicts: PredictsViz, decides: DecidesViz } as const

export function Pillars() {
  const ref = useRef<HTMLElement>(null)
  useScene(ref, () => {
    gsap.fromTo(
      '.pillar-slot',
      { opacity: 0, y: 120, rotateX: 35, z: -200 },
      { opacity: 1, y: 0, rotateX: 0, z: 0, stagger: 0.18, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '.pillars', start: 'top 80%' } },
    )
  })
  return (
    <section ref={ref} className="home-section" id="what">
      <div className="home-wrap">
        <p className="home-eyebrow" data-reveal>
          What Trinetra is
        </p>
        <h2 className="home-h2" data-reveal>
          One junction. <span className="grad">Three abilities.</span>
        </h2>
        <p className="home-lead" data-reveal>
          Trinetra means “three eyes”. It runs a real traffic simulation of a four-way junction and replaces the fixed-time signal with an AI that sees, predicts and decides.
        </p>
        <div className="pillars">
          {PILLARS.map((p, i) => {
            const Icon = PILLAR_ICON[p.key]
            const Viz = PILLAR_VIZ[p.key]
            return (
              <div key={p.key} className="pillar-slot">
                <article className={`pillar pillar-${i} spot`}>
                  <Viz />
                  <div className="pillar-row">
                    <span className="pillar-icon">
                      <Icon size={24} aria-hidden />
                    </span>
                    <h3>{p.title}</h3>
                  </div>
                  <p>{p.body}</p>
                </article>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- how it works

const PIPE_ICON: Record<string, LucideIcon | undefined> = { sim: Car, twin: ScanEye, features: Activity, predict: TrendingUp, decide: BrainCircuit }

export function Pipeline() {
  const ref = useRef<HTMLElement>(null)
  useScene(ref, (el) => {
    const track = el.querySelector<HTMLElement>('.pipe-track')
    if (!track) return
    const distance = () => track.scrollWidth - window.innerWidth + 120
    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: 'top top', end: () => `+=${distance() + window.innerHeight * 0.6}`, scrub: 0.7, pin: true, invalidateOnRefresh: true },
    })
    tl.to(track, { x: () => -distance(), ease: 'none' }, 0)
      .to('.pipe-fill', { scaleX: 1, ease: 'none' }, 0)
      .to('.pipe-pulse', { left: '100%', ease: 'none' }, 0)
    el.querySelectorAll('.pipe-step').forEach((step) => {
      gsap.fromTo(
        step,
        { opacity: 0.25, scale: 0.88 },
        { opacity: 1, scale: 1, ease: 'none', scrollTrigger: { trigger: step, containerAnimation: tl, start: 'left 85%', end: 'left 45%', scrub: true } },
      )
    })
  })
  return (
    <section ref={ref} className="home-pipe" id="how">
      <div className="home-wrap pipe-head">
        <p className="home-eyebrow">How it works</p>
        <h2 className="home-h2">
          Every second, <span className="grad">one loop.</span>
        </h2>
      </div>
      <div className="pipe-track">
        <div className="pipe-line" aria-hidden>
          <div className="pipe-fill" />
          <div className="pipe-pulse" />
        </div>
        {PIPELINE.map((s, i) => {
          const Icon = PIPE_ICON[s.key]
          return (
            <article key={s.key} className="pipe-step spot">
              <span className="pipe-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="pipe-chip">{s.short}</span>
              <span className="pipe-big" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="pipe-icon">
                {Icon ? (
                  <Icon size={26} aria-hidden />
                ) : (
                  <span className="pipe-light" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          )
        })}
        <article className="pipe-step pipe-again spot">
          <span className="pipe-icon">
            <Repeat size={26} aria-hidden />
          </span>
          <h3>And again.</h3>
          <p>The whole loop runs once every simulated second — 3,600 decisions an hour, and the console shows the reasons behind each one.</p>
        </article>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- results

function Counter({ to, decimals = 0, suffix = '' }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced()) {
      el.textContent = to.toFixed(decimals) + suffix
      return
    }
    const obj = { v: 0 }
    const ctx = gsap.context(() => {
      gsap.to(obj, {
        v: to,
        duration: 2.2,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 85%' },
        onUpdate: () => {
          el.textContent = obj.v.toFixed(decimals) + suffix
        },
      })
    })
    return () => ctx.revert()
  }, [to, decimals, suffix])
  return <span ref={ref}>{(0).toFixed(decimals) + suffix}</span>
}

const METRICS: { key: keyof ResultRow; label: string }[] = [
  { key: 'wait', label: 'Waiting time' },
  { key: 'avgQueue', label: 'Average queue' },
  { key: 'worstTravel', label: 'Worst journey' },
  { key: 'travel', label: 'Journey time' },
  { key: 'speed', label: 'Average speed' },
]

/** All seven measures, for a row's breakdown (throughput is level by construction). */
const ALL_MEASURES: { key: keyof ResultRow | null; label: string; better: string }[] = [
  { key: 'wait', label: 'Waiting time', better: 'less' },
  { key: 'travel', label: 'Journey time', better: 'shorter' },
  { key: 'worstTravel', label: 'Worst journey', better: 'shorter' },
  { key: 'avgQueue', label: 'Average queue', better: 'shorter' },
  { key: 'maxQueue', label: 'Longest queue', better: 'shorter' },
  { key: 'speed', label: 'Average speed', better: 'faster' },
  { key: null, label: 'Vehicles through', better: '' },
]

export function Results() {
  const ref = useRef<HTMLElement>(null)
  const [metric, setMetric] = useState<keyof ResultRow>('wait')
  const [open, setOpen] = useState<string | null>(null)
  const rows = RESULTS.toSorted((a, b) => (b[metric] as number) - (a[metric] as number))
  const max = Math.max(...rows.map((r) => r[metric] as number), 1)
  useScene(ref, () => {
    gsap.fromTo('.res-stat', { opacity: 0, y: 60, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, stagger: 0.12, duration: 1, ease: 'back.out(1.6)', scrollTrigger: { trigger: '.res-stats', start: 'top 82%' } })
    gsap.fromTo('.bar-fill', { scaleX: 0 }, { scaleX: 1, stagger: 0.05, duration: 1.3, ease: 'power3.out', scrollTrigger: { trigger: '.res-bars', start: 'top 80%' } })
  })
  return (
    <section ref={ref} className="home-section" id="results">
      <div className="home-wrap">
        <p className="home-eyebrow" data-reveal>
          What it achieved
        </p>
        <h2 className="home-h2" data-reveal>
          Tested against a signal that <span className="grad">already reacts to traffic.</span>
        </h2>
        <p className="home-lead" data-reveal>
          Not a fixed timer: the comparison is a vehicle-actuated controller (VAC), the kind that extends a green while cars keep coming. Both run the exact same traffic at the same time, in lockstep.
        </p>
        <div className="res-stats">
          <div className="res-stat spot">
            <b>
              <Counter to={HEADLINES.scenariosWon} />
              <small>/13</small>
            </b>
            <span className="cap">scenarios won</span>
          </div>
          <div className="res-stat spot">
            <b>
              <Counter to={HEADLINES.metrics} />
              <small>/7</small>
            </b>
            <span className="cap">metrics won or tied, in every scenario</span>
          </div>
          <div className="res-stat spot">
            <b>
              <Counter to={HEADLINES.bestWaitCut} decimals={1} suffix="%" />
            </b>
            <span className="cap">less waiting, at best ({scenarioName('normal_traffic_seed1')})</span>
          </div>
          <div className="res-stat spot">
            <b>
              <Counter to={PREDICTION.betterThanGuessPct} suffix="%" />
            </b>
            <span className="cap">more accurate forecasts than assuming nothing changes</span>
          </div>
        </div>

        <div className="res-bars spot" data-reveal>
          <div className="res-tabs" role="tablist" aria-label="Metric">
            {METRICS.map((m) => (
              <button key={m.key} type="button" role="tab" aria-selected={metric === m.key} className={metric === m.key ? 'on' : ''} onClick={() => setMetric(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.id} className={open === r.id ? 'open' : ''}>
                <button type="button" className="bar-row" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span className="bar-name">{scenarioName(r.id)}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${((r[metric] as number) / max) * 100}%` }} />
                  </span>
                  <span className="bar-val">{(r[metric] as number).toFixed(1)}%</span>
                  <ChevronDown size={15} className="bar-chev" aria-hidden />
                </button>
                <div className="bar-more">
                  <div>
                    <p className="bar-more-head">
                      <b>{r.wins}/7</b> measures better than or level with vehicle-actuated control
                    </p>
                    <div className="bar-chips">
                      {ALL_MEASURES.map((m) => {
                        const v = m.key ? (r[m.key] as number) : 0
                        const tie = v === 0
                        return (
                          <span key={m.label} className={tie ? 'tie' : ''}>
                            <em>{m.label}</em>
                            {tie ? 'tied' : `${v.toFixed(1)}% ${m.better}`}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="res-note">
            Improvement over vehicle-actuated control, seed 1 of every scenario — click a scenario for all seven measures. Throughput (vehicles completed) is tied everywhere by design, and Light and Balanced traffic also tie on the longest queue; every other measure favours Trinetra.
          </p>
        </div>
      </div>
    </section>
  )
}
