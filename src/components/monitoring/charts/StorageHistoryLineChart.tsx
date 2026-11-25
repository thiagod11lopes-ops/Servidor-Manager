import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { HistorySample } from '../../../types/monitoring.ts'
import { useChartTheme } from './useChartTheme.ts'

type StorageHistoryLineChartProps = {
  samples: HistorySample[]
  compact?: boolean
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function StorageHistoryLineChart({ samples, compact }: StorageHistoryLineChartProps) {
  const theme = useChartTheme()

  const points = samples
    .filter((s) => s.diskUsedPercent != null && Number.isFinite(s.diskUsedPercent))
    .map((s) => ({
      t: s.t,
      label: formatTime(s.t),
      diskUsedPercent: s.diskUsedPercent as number,
    }))

  if (points.length < 2) {
    return (
      <div className={`storage-chart-empty${compact ? ' storage-chart-empty-compact' : ''}`}>
        <p>
          Histórico insuficiente ({points.length} amostra{points.length === 1 ? '' : 's'}). Aguarde mais coletas.
        </p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={compact ? 148 : 260}>
      <LineChart data={points} margin={{ top: 4, right: 12, left: 0, bottom: compact ? 0 : 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
        <XAxis dataKey="label" stroke={theme.muted} fontSize={11} interval="preserveStartEnd" minTickGap={28} />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          stroke={theme.muted}
          fontSize={12}
          width={42}
        />
        <Tooltip
          formatter={(value) => {
            const n = typeof value === 'number' ? value : Number(value)
            const label = Number.isFinite(n) ? `${Math.round(n)}%` : '—'
            return [label, 'Disco utilizado']
          }}
          labelFormatter={(_, payload) => {
            const row = payload?.[0]?.payload as { t?: string } | undefined
            return row?.t ? formatTime(row.t) : ''
          }}
          contentStyle={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            color: theme.text,
          }}
        />
        {compact ? null : <Legend />}
        <Line
          type="monotone"
          dataKey="diskUsedPercent"
          name="Utilização do volume principal"
          stroke={theme.accent}
          strokeWidth={2}
          dot={false}
          animationDuration={500}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
