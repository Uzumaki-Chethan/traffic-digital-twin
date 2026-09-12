import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { Activity, BarChart3, ChartColumnIncreasing, ListTree, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useSim } from '@/data/store'

const NAV = [
  { to: '/', label: 'Overview', icon: Activity, end: true },
  { to: '/analytics', label: 'Analytics', icon: ChartColumnIncreasing },
  { to: '/performance', label: 'Performance', icon: BarChart3 },
  { to: '/decisions', label: 'Decisions', icon: ListTree },
]

/**
 * The rail, on the dark chrome. Collapses to an icon strip so the plate
 * gets the full width; the choice persists.
 */
export function NavRail() {
  const link = useSim((s) => s.link)
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
      className={clsx('flex shrink-0 flex-col bg-chrome transition-[width] duration-200', collapsed ? 'w-14' : 'w-56')}
      style={{ transitionTimingFunction: 'var(--ease-out)' }}
    >
      <div className={clsx('flex h-14 items-center border-b border-chrome-rule', collapsed ? 'justify-center' : 'gap-2.5 px-4')}>
        <TrinetraMark />
        {!collapsed && <span className="display text-[16px] text-chrome-ink">TRINETRA</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center rounded-control py-2.5 text-[13.5px] transition-colors',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                isActive ? 'bg-chrome-rule/70 font-semibold text-chrome-ink' : 'text-chrome-mute hover:bg-chrome-rule/40 hover:text-chrome-ink',
              )
            }
          >
            <Icon size={17} strokeWidth={1.75} aria-hidden />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={clsx('border-t border-chrome-rule p-2', !collapsed && 'px-3 py-2.5')}>
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="text-chrome-mute">Simulation link</span>
            <span className="num text-chrome-ink">{link === 'open' ? 'ONLINE' : link === 'connecting' ? 'CONNECTING' : 'OFFLINE'}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className={clsx(
            'flex w-full items-center rounded-control py-2 text-[12.5px] text-chrome-mute transition-colors hover:bg-chrome-rule/40 hover:text-chrome-ink',
            collapsed ? 'justify-center' : 'gap-2 px-2',
          )}
        >
          {collapsed ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

/** Plain stand-in. The real eye + traffic-light logo is to be re-supplied;
 * per the brief, no mark is invented in its absence. */
function TrinetraMark() {
  return (
    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-lamp-housing">
      <span className="flex flex-col gap-[2px]">
        <span className="h-[4px] w-[4px] rounded-full bg-lamp-red" />
        <span className="h-[4px] w-[4px] rounded-full bg-lamp-amber" />
        <span className="h-[4px] w-[4px] rounded-full bg-lamp-green" />
      </span>
    </span>
  )
}
