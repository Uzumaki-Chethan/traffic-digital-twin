import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtSeconds } from '@/utils/format'

interface Series {
  key: string
  label: string
  color: string
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[]
  xKey: string
  series: Series[]
  yUnit?: string
  height?: number
}

export function TrendChart({ data, xKey, series, yUnit, height = 220 }: Props) {
  if (data.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-[var(--color-text-faint)]">
        Collecting samples…
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--color-border-soft)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey={xKey}
          tickFormatter={(v: unknown) => fmtSeconds(Number(v))}
          stroke="var(--color-text-faint)"
          tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
        />
        <YAxis
          stroke="var(--color-text-faint)"
          tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={false}
          width={36}
          unit={yUnit}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-panel-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(v: unknown) => `T+${fmtSeconds(Number(v))}`}
          labelStyle={{ color: 'var(--color-text-dim)' }}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
