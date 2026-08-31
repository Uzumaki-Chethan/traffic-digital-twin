import { Suspense, lazy } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { useDashboardSocket } from '@/hooks/useDashboardSocket'

const DigitalTwinPage = lazy(() => import('@/pages/DigitalTwinPage').then((m) => ({ default: m.DigitalTwinPage })))
const PerformancePage = lazy(() => import('@/pages/PerformancePage').then((m) => ({ default: m.PerformancePage })))
const ScenarioControlPage = lazy(() =>
  import('@/pages/ScenarioControlPage').then((m) => ({ default: m.ScenarioControlPage })),
)
const LogsPage = lazy(() => import('@/pages/LogsPage').then((m) => ({ default: m.LogsPage })))

const TITLES: Record<string, string> = {
  '/': 'Digital Twin',
  '/performance': 'Performance Evaluation',
  '/scenarios': 'Scenario Control',
  '/logs': 'Logs & Insights',
}

export default function App() {
  useDashboardSocket()
  const location = useLocation()
  const title = TITLES[location.pathname] ?? 'Digital Twin'

  return (
    <AppShell pageTitle={title}>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<DigitalTwinPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/scenarios" element={<ScenarioControlPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}
