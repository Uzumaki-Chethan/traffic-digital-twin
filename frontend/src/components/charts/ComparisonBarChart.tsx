import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ComparisonRow } from '@/types/snapshot'

interface Props {
  rows: ComparisonRow[]
  height?: number
}

/**
 * One grouped bar per metric (AI vs Baseline), with the % improvement
 * printed above each pair. Colors follow the same signal logic as the
 * rest of the app: green when AI improved on the metric, red when it
 * regressed - matching performance/evaluator.py's own honest
 * "IMPROVED / REGRESSED" verdict rather than always painting AI green.
 */
export function ComparisonBarChart({ rows, height = 260 }: Props) {
  const data = rows.map((r) => ({
    label: r.label.replace(/\s*\([^)]*\)/, ''),
    AI: Number(r.ai.toFixed(2)),
    Baseline: Number(r.baseline.toFixed(2)),
    improvement: r.improvement,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--color-border-soft)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          stroke="var(--color-text-faint)"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
          interval={0}
          angle={-12}
          textAnchor="end"
          height={50}
        />
        <YAxis stroke="var(--color-text-faint)" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} width={36} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-panel-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--color-text-dim)' }}
        />
        <Bar dataKey="Baseline" fill="var(--color-text-faint)" radius={[3, 3, 0, 0] as [number, number, number, number]} />
        <Bar dataKey="AI" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.improvement >= 0 ? 'var(--color-flow)' : 'var(--color-stop)'} />
          ))}
          <LabelList
            dataKey="improvement"
            position="top"
            formatter={(v: unknown) => {
              const n = Number(v)
              return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
            }}
            style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-dim)' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
