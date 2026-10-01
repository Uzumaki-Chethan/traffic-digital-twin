import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import clsx from 'clsx'
import { Activity, BarChart3, ChartColumnIncreasing, ChevronsLeft, ListTree, SlidersHorizontal } from 'lucide-react'
import { DUR, EASE_OUT, EASE_SPRING } from '@/ui/motion'
import { Brand } from './Brand'

const NAV = [
  { to: '/', label: 'Overview', icon: Activity, end: true },
  { to: '/analytics', label: 'Analytics', icon: ChartColumnIncreasing },
  { to: '/performance', label: 'Performance', icon: BarChart3 },
  { to: '/decisions', label: 'Decisions', icon: ListTree },
  { to: '/settings', label: 'Simulation Settings', icon: SlidersHorizontal },
]

/**
 * The rail: dark glass over the city, fading toward the bottom so the
 * photo shows through. Logo, then the pages, the tagline and Collapse.
 * (The "Simulation link" card was removed on the owner's instruction,
 * 2026-09-30 — the top bar's link pill and the footer's stream state say
 * the same thing.) On a short screen the pages scroll and the tagline
 * hides, so Collapse is always reachable. Collapses to an icon strip (the logo stays; the name
 * and labels go) and the choice persists.
 *
 * The active item carries an orange glow that SLIDES between destinations
 * (one shared `layoutId`). Each item ends in a tiny three-lamp signal: the
 * page you're on shows green, a page you point at shows amber, the rest
 * rest on red — "where you are" said in the product's own language.
 */
export function NavRail() {
  const reduced = useReducedMotion()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('trinetra.rail') === 'collapsed'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('trinetra.rail', collapsed ? 'collapsed' : 'open')
    } catch {
      // storage unavailable — fine for the session
    }
  }, [collapsed])

  return (
    <aside
      data-frost
      className={clsx(
        'rail relative z-[4] flex shrink-0 flex-col overflow-hidden rounded-[26px] transition-[width] duration-[380ms]',
        collapsed ? 'w-20' : 'w-[270px]',
      )}
      style={{
        transitionTimingFunction: 'var(--ease-mid)',
        border: '1px solid rgb(255 255 255 / 0.14)',
        // The frost is a static layer in Backdrop cut to this box (data-frost);
        // only the dark tint is painted here (Section 37.12).
        backgroundImage: 'linear-gradient(180deg, rgb(6 12 28 / 0.78), rgb(6 12 28 / 0.6) 45%, rgb(6 12 28 / 0.3) 70%, rgb(6 12 28 / 0.55))',
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.12), 0 30px 60px -30px rgb(0 0 0 / 0.85)',
      }}
    >
      <Brand collapsed={collapsed} />

      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 py-2.5 [scrollbar-width:none]" aria-label="Pages">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                // One layout in both states: the icon never moves (18 px in,
                // centred in the collapsed strip); only the label and the
                // mini signal fade, clipped by the rail as it narrows.
                'group relative flex h-[52px] items-center gap-2.5 rounded-[15px] pl-[18px] pr-3 text-[14px] transition-colors',
                isActive ? 'font-medium text-white' : 'text-[#F1F4FA] hover:text-white',
              )
            }
            style={{ textShadow: '0 1px 6px rgb(0 0 0 / 0.6)' }}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId={reduced ? undefined : 'nav-active'}
                    className="nav-active absolute inset-0 overflow-hidden rounded-[15px]"
                    style={{
                      background: 'linear-gradient(90deg, rgb(255 140 30 / 0.46), rgb(255 120 20 / 0.18) 62%, rgb(255 120 20 / 0.08))',
                      border: '1px solid var(--brand-edge)',
                      boxShadow: '0 0 24px -2px var(--brand-glow), inset 0 0 20px -6px rgb(255 190 100 / 0.7)',
                    }}
                    transition={{ duration: DUR.enter * 0.8, ease: EASE_SPRING }}
                  />
                )}
                {!isActive && (
                  <span className="absolute inset-0 rounded-[15px] bg-white/0 transition-colors duration-150 group-hover:bg-white/[0.07]" />
                )}
                <Icon
                  size={21}
                  strokeWidth={1.75}
                  aria-hidden
                  className="relative z-10 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                  style={isActive ? { color: '#FF5A3C', filter: 'drop-shadow(0 0 6px rgb(255 90 60 / 0.8))' } : undefined}
                />
                <span className={clsx('rail-fade relative z-10 whitespace-nowrap', collapsed && 'rail-hidden')}>{label}</span>
                <MiniSignal active={isActive} hidden={collapsed} />
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div
        aria-hidden={collapsed}
        className={clsx(
          'rail-fade mx-[22px] mb-3.5 shrink-0 whitespace-nowrap text-[17px] font-medium leading-[1.3] [@media(max-height:700px)]:hidden',
          collapsed && 'rail-hidden',
        )}
        style={{ color: 'var(--tagline)', textShadow: '0 0 18px rgb(247 192 74 / 0.45), 0 2px 6px rgb(0 0 0 / 0.6)' }}
      >
        Smarter Signals
        <br />
        Safer Cities
      </div>

      <div className="flex shrink-0 flex-col gap-3 px-3.5 pb-3.5">
        <motion.button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={{ duration: DUR.tick, ease: EASE_OUT }}
          className="rail-card flex h-[52px] w-full items-center gap-3.5 px-4 text-[13.5px] text-[#E6ECF6] transition-colors hover:text-white"
        >
          {/* one arrow that turns round, rather than two icons swapping */}
          <ChevronsLeft
            size={18}
            aria-hidden
            className="shrink-0 transition-transform duration-[380ms]"
            style={{ transform: collapsed ? 'rotate(180deg)' : undefined, transitionTimingFunction: 'var(--ease-mid)' }}
          />
          <span className={clsx('rail-fade whitespace-nowrap', collapsed && 'rail-hidden')}>Collapse</span>
        </motion.button>
      </div>
    </aside>
  )
}

/** The item's own three-lamp signal: green here, amber on hover, red otherwise. */
function MiniSignal({ active, hidden }: { active: boolean; hidden: boolean }) {
  return (
    <span
      aria-hidden
      // ml-auto plus a min gap: on the longest label (Simulation Settings)
      // it used to be squeezed against the selected pill's orange border.
      className={clsx('rail-fade relative z-10 ml-auto flex shrink-0 gap-[3px] rounded-full px-[5px] py-[5px]', hidden && 'rail-hidden')}
      style={{ background: 'rgb(0 0 0 / 0.6)', border: '1px solid rgb(255 255 255 / 0.12)' }}
    >
      <i
        className={clsx('h-1.5 w-1.5 rounded-full transition-colors', !active && 'mini-red')}
        style={{ background: active ? '#1C4A33' : undefined }}
      />
      <i className="mini-amber h-1.5 w-1.5 rounded-full transition-colors" style={{ background: active ? '#1C4A33' : undefined }} />
      <i
        className="h-1.5 w-1.5 rounded-full transition-colors"
        style={active ? { background: '#2AF28E', boxShadow: '0 0 6px #2AF28E' } : { background: '#3A2228' }}
      />
    </span>
  )
}
