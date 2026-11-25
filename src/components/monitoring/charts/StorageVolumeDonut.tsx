import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { VolumeStorageSnapshot } from '../../../types/monitoring.ts'
import { formatBytes } from '../../../utils/formatBytes.ts'
import { useChartTheme } from './useChartTheme.ts'
import { tooltipBytesFromUnknown } from './chartFormatters.ts'

type StorageVolumeDonutProps = {
  volume: VolumeStorageSnapshot
  compact?: boolean
}

export function StorageVolumeDonut({ volume, compact }: StorageVolumeDonutProps) {
  const theme = useChartTheme()

  if (
    volume.usedBytes == null ||
    volume.availableBytes == null ||
    volume.totalBytes == null ||
    volume.availability === 'unavailable'
  ) {
    return (
      <div className="storage-chart-empty">
        <p>{volume.detail ?? 'Disco indisponível para este volume.'}</p>
      </div>
    )
  }

  const data = [
    { name: 'Utilizado', value: volume.usedBytes, color: theme.accent },
    { name: 'Disponível', value: volume.availableBytes, color: theme.success },
  ]

  return (
    <div className={`storage-donut-wrap${compact ? ' storage-donut-wrap-compact' : ''}`}>
      <ResponsiveContainer width="100%" height={compact ? 148 : 240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            animationDuration={450}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} stroke={theme.surface} strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => tooltipBytesFromUnknown(value)}
            contentStyle={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              color: theme.text,
              fontSize: 13,
            }}
          />
          {compact ? null : <Legend verticalAlign="bottom" height={36} iconType="circle" />}
        </PieChart>
      </ResponsiveContainer>
      <p className="storage-donut-center" aria-hidden>
        {volume.usedPercent != null ? `${volume.usedPercent}%` : '—'}
        <span>{formatBytes(volume.usedBytes)} usados</span>
      </p>
    </div>
  )
}
