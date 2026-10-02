import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { ArrowRight } from 'lucide-react'
import { useRunStore } from '@/data/runState'
import { TrafficCursor } from '@/layout/TrafficCursor'
import eye from '@/assets/trinetra-eye.png'
import { CityTrails } from './CityTrails'
import { Hero, Pillars, Pipeline, Problem, Results } from './sectionsStory'
import { ConsoleTour, Finale, Resilience, Rig, Scenarios } from './sectionsShow'
import './home.css'

gsap.registerPlugin(ScrollTrigger)

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The home page (Section 44): full-screen, outside the console frame —
 * what Trinetra is, how it works, what it achieved (real numbers only,
 * from home/content.ts), what it copes with, every scenario, a tour of
 * the console, and the physical model. Smooth scrolling (Lenis) drives
 * GSAP ScrollTrigger scenes and the 3D city behind (CityTrails). With
 * reduced motion: native scrolling, simple fades, a still background.
 */
export function HomePage() {
  const progress = useRef(0)
  const bar = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const still = reduced()
  const run = useRunStore((s) => s.state)
  const lenisRef = useRef<Lenis | null>(null)

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
    // layout settles after fonts/images; let the triggers re-measure
    const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 600)
    return () => {
      window.clearTimeout(refresh)
      window.removeEventListener('scroll', onProgress)
      ctx.revert()
      if (tick) gsap.ticker.remove(tick)
      lenis?.destroy()
      lenisRef.current = null
      document.title = 'Trinetra'
    }
  }, [still])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    if (lenisRef.current) lenisRef.current.scrollTo(el, { duration: 1.6 })
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY })
  }

  return (
    <div ref={root} className={still ? 'home' : 'home home-anim'}>
      <CityTrails progress={progress} still={still} />
      <div className="home-vignette" aria-hidden />
      <div ref={bar} className="home-progress" aria-hidden />

      <header className="home-top">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Trinetra home">
          <img src={eye} alt="" className="h-9 w-auto drop-shadow-[0_0_12px_rgba(255,120,40,0.45)]" />
          <span className="font-display text-[15px] font-bold tracking-[0.18em] text-white">TRINETRA</span>
        </Link>
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
        <Finale />
      </main>
      <TrafficCursor />
    </div>
  )
}
