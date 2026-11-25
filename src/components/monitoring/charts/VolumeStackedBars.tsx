import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { VolumeStorageSnapshot } from '../../../types/monitoring.ts'
import { useChartTheme } from './useChartTheme.ts'
import { formatAxisBytes, tooltipBytesFromUnknown } from './chartFormatters.ts'

type VolumeStackedBarsProps = {
  volumes: VolumeStorageSnapshot[]
  compact?: boolean
}

/** Barras empilhadas utilizado/disponível por volume monitorado (dados independentes por volume). */
export function VolumeStackedBars({ volumes, compact }: VolumeStackedBarsProps) {
  const theme = useChartTheme()

  const data = volumes
    .filter((v) => v.usedBytes != null && v.availableBytes != null)
    .map((v) => ({
      name: v.label.length > 28 ? `${v.label.slice(0, 26)}…` : v.label,
      utilizado: v.usedBytes as number,
      disponivel: v.availableBytes as number,
    }))

  if (data.length === 0) return null

  return (
    <div className="storage-stacked-section">
      <p className="monitoring-chart-subtitle">Comparativo por volume monitorado</p>
      <ResponsiveContainer width="100%" height={Math.max(compact ? 72 : 140, data.length * (compact ? 36 : 56))}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false} />
          <XAxis type="number" tickFormatter={formatAxisBytes} stroke={theme.muted} fontSize={12} />
          <YAxis type="category" dataKey="name" width={140} stroke={theme.muted} fontSize={11} tick={{ fill: theme.text }} />
          <Tooltip
            formatter={(value) => tooltipBytesFromUnknown(value)}
            contentStyle={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              color: theme.text,
            }}
          />
          <Legend />
          <Bar dataKey="utilizado" stackId="vol" fill={theme.accent} radius={[0, 0, 0, 0]} />
          <Bar dataKey="disponivel" stackId="vol" fill={theme.success} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
