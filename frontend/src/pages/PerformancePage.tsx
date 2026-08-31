import { useEffect, useState } from 'react'
import { useSimStore } from '@/store/useSimStore'
import { isLive } from '@/types/snapshot'
import { Panel } from '@/components/common/Panel'
import { ComparisonBarChart } from '@/components/charts/ComparisonBarChart'
import { ComparisonSummaryCards } from '@/components/traffic/ComparisonSummaryCards'
import { TrendChart } from '@/components/charts/TrendChart'
import { api } from '@/services/api'
import type { ResultsSummary } from '@/types/logs'

function LiveComparison() {
  const latest = useSimStore((s) => s.latest)
  const live = isLive(latest) ? latest : null
  const comparison = live?.comparison

  if (!comparison || comparison.rows.length === 0) {
    return (
      <Panel title="Live Comparison" eyebrow="AI vs SUMO baseline">
        <div className="py-6 text-center text-xs text-[var(--color-text-faint)]">
          No live comparison is running. Start the evaluator with{' '}
          <code className="rounded bg-[var(--color-panel-inset)] px-1.5 py-0.5 font-mono">
            python -m performance.evaluator --dashboard
          </code>{' '}
          to stream a live AI-vs-baseline run here, or see saved results below.
        </div>
      </Panel>
    )
  }

  return (
    <div className="space-y-4">
      <Panel title="Live Comparison" eyebrow="AI vs SUMO baseline · running now">
        <ComparisonSummaryCards rows={comparison.rows} />
      </Panel>
      <Panel title="Metric Comparison" eyebrow="Bar height = value, label = % improvement">
        <ComparisonBarChart rows={comparison.rows} />
      </Panel>
    </div>
  )
}

function SavedResults() {
  const [results, setResults] = useState<ResultsSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .results()
      .then(setResults)
      .catch(() => setError('No saved results found (results/*.csv from a prior evaluator run).'))
  }, [])

  if (error) {
    return (
      <Panel title="Saved Evaluation Runs" eyebrow="From results/*.csv">
        <div className="py-6 text-center text-xs text-[var(--color-text-faint)]">{error}</div>
      </Panel>
    )
  }

  if (!results) {
    return (
      <Panel title="Saved Evaluation Runs" eyebrow="From results/*.csv">
        <div className="py-6 text-center text-xs text-[var(--color-text-faint)]">Loading…</div>
      </Panel>
    )
  }

  return (
    <div className="space-y-4">
      {results.map((r) => (
        <Panel key={r.scenario} title={r.scenario} eyebrow="Saved run">
          <ComparisonBarChart
            rows={r.rows.map((row) => ({
              key: row.metric,
              label: row.metric,
              ai: row.ai,
              baseline: row.baseline,
              improvement: row.improvement_pct,
            }))}
            height={220}
          />
        </Panel>
      ))}
    </div>
  )
}

function LiveTrends() {
  const trend = useSimStore((s) => s.trend)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Average Waiting Time" eyebrow="Live trend · this run">
        <TrendChart
          data={trend}
          xKey="t"
          series={[{ key: 'avg_wait', label: 'Avg wait (s)', color: 'var(--color-transition)' }]}
        />
      </Panel>
      <Panel title="Queue Length" eyebrow="Live trend · this run">
        <TrendChart
          data={trend}
          xKey="t"
          series={[{ key: 'queue', label: 'Queue (veh)', color: 'var(--color-warn)' }]}
        />
      </Panel>
    </div>
  )
}

export function PerformancePage() {
  return (
    <div className="space-y-6">
      <LiveComparison />
      <LiveTrends />
      <SavedResults />
    </div>
  )
}
