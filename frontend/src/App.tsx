import { Route, Routes } from 'react-router-dom'
import { Shell } from '@/layout/Shell'
import { useSocket } from '@/data/useSocket'
import { useRunStatePoll } from '@/data/runState'
import { OverviewPage } from '@/pages/OverviewPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { DecisionsPage } from '@/pages/DecisionsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { PerformancePage } from '@/pages/PerformancePage'

export default function App() {
  useSocket()
  // One poll for the whole app: the top bar and the Analytics empty
  // state both need to know what this backend will let them do.
  useRunStatePoll()
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/performance" element={<PerformancePage />} />
        <Route path="/decisions" element={<DecisionsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Shell>
  )
}
