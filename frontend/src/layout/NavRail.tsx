import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import clsx from 'clsx'
import { Activity, BarChart3, ChartColumnIncreasing, ChevronsLeft, ChevronsRight, ListTree, SlidersHorizontal } from 'lucide-react'
import { useSim } from '@/data/store'
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
 * photo shows through. Logo, then the pages, the tagline, the simulation
 * link and Collapse. Collapses to an icon strip (the logo stays; the name
 * and labels go) and the choice persists.
 *
 * The active item carries an orange glow that SLIDES between destinations
 * (one shared `layoutId`). Each item ends in a tiny three-lamp signal: the
 * page you're on shows green, a page you point at shows amber, the rest
 * rest on red — "where you are" said in the product's own language.
 */
export function NavRail() {
  const link = useSim((s) => s.link)
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

  const linkWord = link === 'open' ? 'ONLINE' : link === 'connecting' ? 'CONNECTING' : 'OFFLINE'

  return (
    <aside
      className={clsx(
        'relative z-[4] flex shrink-0 flex-col overflow-hidden rounded-[26px] transition-[width] duration-300',
        collapsed ? 'w-20' : 'w-[250px]',
      )}
      style={{
        transitionTimingFunction: 'var(--ease-out)',
        border: '1px solid rgb(255 255 255 / 0.14)',
        background:
          'linear-gradient(180deg, rgb(6 12 28 / 0.78), rgb(6 12 28 / 0.6) 45%, rgb(6 12 28 / 0.3) 70%, rgb(6 12 28 / 0.55))',
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.12), 0 30px 60px -30px rgb(0 0 0 / 0.85)',
        backdropFilter: 'blur(5px) saturate(130%)',
        WebkitBackdropFilter: 'blur(5px) saturate(130%)',
      }}
    >
      <Brand collapsed={collapsed} />

      <nav className="flex flex-col gap-2 px-2.5 py-2.5" aria-label="Pages">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                'group relative flex h-[52px] items-center rounded-[15px] text-[14.5px] transition-colors',
                collapsed ? 'justify-center px-0' : 'gap-[13px] px-3',
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
                    className="absolute inset-0 rounded-[15px]"
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
                {!collapsed && (
                  <>
                    <span className="relative z-10 truncate">{label}</span>
                    <MiniSignal active={isActive} />
                  </>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      {!collapsed && (
        <div
          className="mx-[22px] mb-3.5 text-[17px] font-medium leading-[1.3]"
          style={{ color: 'var(--tagline)', textShadow: '0 0 18px rgb(247 192 74 / 0.45), 0 2px 6px rgb(0 0 0 / 0.6)' }}
        >
          Smarter Signals
          <br />
          Safer Cities
        </div>
      )}

      <div className="flex flex-col gap-3 px-3.5 pb-3.5">
        {!collapsed ? (
          <div className="rail-card flex h-[52px] items-center justify-between px-4 text-[13px] text-[#E6ECF6]">
            <span>Simulation link</span>
            <span className="num text-[12.5px] font-medium tracking-[0.04em]" style={{ color: link === 'open' ? '#3BE58F' : link === 'connecting' ? '#FFB23A' : '#FF6B75' }}>
              {linkWord}
            </span>
          </div>
        ) : (
          <div
            className="rail-card flex h-[52px] items-center justify-center"
            title={`Simulation link: ${linkWord.toLowerCase()}`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: link === 'open' ? '#3BE58F' : link === 'connecting' ? '#FFB23A' : '#FF6B75',
                boxShadow: `0 0 8px ${link === 'open' ? '#3BE58F' : link === 'connecting' ? '#FFB23A' : '#FF6B75'}`,
              }}
            />
          </div>
        )}
        <motion.button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={{ duration: DUR.tick, ease: EASE_OUT }}
          className={clsx(
            'rail-card flex h-[52px] w-full items-center text-[13.5px] text-[#E6ECF6] transition-colors hover:text-white',
            collapsed ? 'justify-center' : 'gap-3.5 px-4',
          )}
        >
          {collapsed ? <ChevronsRight size={18} aria-hidden /> : <ChevronsLeft size={18} aria-hidden />}
          {!collapsed && <span>Collapse</span>}
        </motion.button>
      </div>
    </aside>
  )
}

/** The item's own three-lamp signal: green here, amber on hover, red otherwise. */
function MiniSignal({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className="relative z-10 ml-auto flex shrink-0 gap-1 rounded-full px-1.5 py-1"
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
