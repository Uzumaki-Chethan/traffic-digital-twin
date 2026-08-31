import { NavLink } from 'react-router-dom'
import { Activity, GaugeCircle, ListTree, SlidersHorizontal, TrafficCone } from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { to: '/', label: 'Digital Twin', icon: Activity, end: true },
  { to: '/performance', label: 'Performance', icon: GaugeCircle },
  { to: '/scenarios', label: 'Scenario Control', icon: SlidersHorizontal },
  { to: '/logs', label: 'Logs & Insights', icon: ListTree },
]

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--color-border-soft)] px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-neutral-dim)]">
          <TrafficCone size={17} className="text-[var(--color-neutral)]" />
        </div>
        <div>
          <div className="text-[13px] font-semibold leading-tight text-[var(--color-text)]">
            Traffic Command
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
            Digital Twin · Junction C
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-[var(--color-neutral-dim)] text-[var(--color-neutral)]'
                  : 'text-[var(--color-text-dim)] hover:bg-[var(--color-panel-raised)] hover:text-[var(--color-text)]',
              )
            }
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[var(--color-border-soft)] px-5 py-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          AI-Driven Adaptive Traffic
        </div>
        <div className="text-[10px] text-[var(--color-text-faint)]">SUMO-Driven Closed Loop v2</div>
      </div>
    </aside>
  )
}
