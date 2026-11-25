import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SystemStorageRow } from '../../../types/monitoring.ts'
import { useChartTheme } from './useChartTheme.ts'
import { formatAxisBytes, tooltipBytesFromUnknown } from './chartFormatters.ts'

type SystemsStorageBarChartProps = {
  rows: SystemStorageRow[]
  nameById: Record<string, string>
  compact?: boolean
}

export function SystemsStorageBarChart({ rows, nameById, compact }: SystemsStorageBarChartProps) {
  const theme = useChartTheme()

  const data = rows
    .filter((row) => row.totalMeasured.bytes != null)
    .map((row) => ({
      id: row.systemId,
      name: nameById[row.systemId] ?? row.systemId.slice(0, 8),
      bytes: row.totalMeasured.bytes as number,
      availability: row.totalMeasured.availability,
    }))
    .sort((a, b) => b.bytes - a.bytes)

  if (data.length === 0) {
    return (
      <div className="storage-chart-empty">
        <p>Nenhum sistema com total medido disponível ainda. Aguarde a próxima coleta ou instale um sistema.</p>
      </div>
    )
  }

  const rowH = compact ? 26 : 44
  const maxH = compact ? 156 : 420
  const minH = compact ? 88 : 160
  const height = Math.min(maxH, Math.max(minH, data.length * rowH))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false} />
        <XAxis type="number" tickFormatter={formatAxisBytes} stroke={theme.muted} fontSize={12} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          stroke={theme.muted}
          fontSize={12}
          tick={{ fill: theme.text }}
        />
        <Tooltip
          formatter={(value, _name, item) => {
            const avail = (item.payload as { availability?: string }).availability
            const suffix = avail === 'estimated' ? ' (estimado)' : avail === 'measured' ? ' (medido)' : ''
            return [`${tooltipBytesFromUnknown(value)}${suffix}`, 'Total']
          }}
          contentStyle={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            color: theme.text,
          }}
        />
        <Bar dataKey="bytes" fill={theme.accent} radius={[0, 6, 6, 0]} animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  )
}
