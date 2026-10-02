import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { ArrowRight } from 'lucide-react'
import { useRunStore } from '@/data/runState'
import { TrafficCursor } from '@/layout/TrafficCursor'
import eye from '@/assets/trinetra-eye.png'
import wordmark from '@/assets/trinetra-wordmark.png'
import { MorningCity } from './MorningCity'
import { Hero, Pillars, Pipeline, Problem, Results } from './sectionsStory'
import { ConsoleTour, Finale, Resilience, Rig, Scenarios } from './sectionsShow'
import './home.css'

gsap.registerPlugin(ScrollTrigger)

/** The page's chapters, for the side navigator and the top bar. */
const CHAPTERS: { id: string; label: string; top?: boolean }[] = [
  { id: 'top', label: 'Trinetra' },
  { id: 'problem', label: 'The problem' },
  { id: 'what', label: 'What it is' },
  { id: 'how', label: 'How it works', top: true },
  { id: 'results', label: 'Results', top: true },
  { id: 'unexpected', label: 'The unexpected' },
  { id: 'scenarios', label: 'Scenarios', top: true },
  { id: 'console', label: 'The console', top: true },
  { id: 'rig', label: 'Physical model', top: true },
  { id: 'start', label: 'Start' },
]

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The home page (Section 44): full-screen, outside the console frame —
 * what Trinetra is, how it works, what it achieved (real numbers only,
 * from home/content.ts), what it copes with, every scenario, a tour of
 * the console, and the physical model. Smooth scrolling (Lenis) drives
 * GSAP ScrollTrigger scenes and the morning city behind (MorningCity). With
 * reduced motion: native scrolling, simple fades, a still background.
 */
export function HomePage() {
  const progress = useRef(0)
  const bar = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const still = reduced()
  const run = useRunStore((s) => s.state)
  const lenisRef = useRef<Lenis | null>(null)
  const [chapter, setChapter] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    document.title = 'Trinetra — AI traffic signal control'
    const onProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? window.scrollY / max : 0
      progress.current = p
      if (bar.current) bar.current.style.transform = `scaleX(${p})`
    }
    let lenis: Lenis | null = null
    let tick: ((t: number) => void) | null = null
    if (!still) {
      lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 })
      lenisRef.current = lenis
      lenis.on('scroll', () => {
        ScrollTrigger.update()
        onProgress()
      })
      tick = (t: number) => lenis?.raf(t * 1000)
      gsap.ticker.add(tick)
      gsap.ticker.lagSmoothing(0)
    }
    window.addEventListener('scroll', onProgress, { passive: true })
    onProgress()


    // every [data-reveal] rises in as it enters (sections add their own scenes)
    const ctx = gsap.context(() => {
      if (still) return
      ScrollTrigger.batch('[data-reveal]', {
        start: 'top 88%',
        onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'power3.out', stagger: 0.09, overwrite: true }),
      })
    }, root)
    // which chapter is on screen (created after the sections' own pins, so
    // their spacing is already counted)
    const chapterTriggers = CHAPTERS.map((c, i) => {
      const el = document.getElementById(c.id)
      // a pinned section is measured by its spacer, which spans the whole pin
      const trigger = el?.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el
      return trigger ? ScrollTrigger.create({ trigger, start: 'top 55%', end: 'bottom 55%', onToggle: (self) => self.isActive && setChapter(i) }) : null
    })
    const topTrigger = ScrollTrigger.create({ start: 120, end: 'max', onToggle: (self) => setScrolled(self.isActive) })

    // layout settles after fonts/images; let the triggers re-measure
    const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 600)
    return () => {
      window.clearTimeout(refresh)
      window.removeEventListener('scroll', onProgress)
      ctx.revert()
      chapterTriggers.forEach((t) => t?.kill())
      topTrigger.kill()
      if (tick) gsap.ticker.remove(tick)
      lenis?.destroy()
      lenisRef.current = null
      document.title = 'Trinetra'
    }
  }, [still])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    // a pinned section's spacer starts where the section does
    const target = el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el
    if (lenisRef.current) lenisRef.current.scrollTo(target, { duration: 1.6 })
    else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY })
  }

  return (
    <div ref={root} className={still ? 'home' : 'home home-anim'}>
      <MorningCity progress={progress} still={still} />
      <div className="home-vignette" aria-hidden />
      <div ref={bar} className="home-progress" aria-hidden />

      <header className={scrolled ? 'home-top scrolled' : 'home-top'}>
        <Link to="/" className="home-brand" aria-label="Trinetra home">
          <img src={eye} alt="" />
          <img src={wordmark} alt="" className="home-top-word" />
        </Link>
        <nav className="home-links" aria-label="Sections">
          {CHAPTERS.filter((c) => c.top).map((c) => (
            <button key={c.id} type="button" className={CHAPTERS[chapter].id === c.id ? 'on' : ''} onClick={() => scrollTo(c.id)}>
              {c.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {run?.running && (
            <Link to={run.kind === 'evaluation' ? '/performance' : '/overview'} className="home-live">
              <span className="home-live-dot" /> A {run.kind === 'evaluation' ? 'contest' : 'simulation'} is running — watch it
            </Link>
          )}
          <Link to="/overview" className="home-cta-small">
            Open the console <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </header>

      <nav className="home-chapters" aria-label="Chapters">
        {CHAPTERS.map((c, i) => (
          <button key={c.id} type="button" className={i === chapter ? 'on' : ''} onClick={() => scrollTo(c.id)} aria-label={c.label} aria-current={i === chapter ? 'true' : undefined}>
            <span>{c.label}</span>
            <i />
          </button>
        ))}
      </nav>

      <main>
        <Hero onMore={() => scrollTo('problem')} />
        <Problem />
        <Pillars />
        <Pipeline />
        <Results />
        <Resilience />
        <Scenarios />
        <ConsoleTour />
        <Rig />
        <Finale onTop={() => scrollTo('top')} />
      </main>
      <TrafficCursor />
    </div>
  )
}
