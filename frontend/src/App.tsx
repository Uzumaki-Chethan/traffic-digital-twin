import { Route, Routes } from 'react-router-dom'
import { Shell } from '@/layout/Shell'
import { useSocket } from '@/data/useSocket'
import { useRunStatePoll } from '@/data/runState'
import { OverviewPage } from '@/pages/OverviewPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { NotBuiltPage } from '@/pages/NotBuiltPage'

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
        <Route path="/performance" element={<NotBuiltPage title="Performance" iteration={3} />} />
        <Route path="/decisions" element={<NotBuiltPage title="Decisions" iteration={3} />} />
      </Routes>
    </Shell>
  )
}
