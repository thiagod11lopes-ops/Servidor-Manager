import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AcompStorageDetail } from '../../../types/monitoring.ts'
import { useChartTheme } from './useChartTheme.ts'
import { formatAxisBytes, availabilityNote, tooltipBytesFromUnknown } from './chartFormatters.ts'

type AcompCategoriesBarChartProps = {
  detail: AcompStorageDetail
  compact?: boolean
}

export function AcompCategoriesBarChart({ detail, compact }: AcompCategoriesBarChartProps) {
  const theme = useChartTheme()

  const data = detail.categories
    .filter((cat) => cat.field.bytes != null)
    .map((cat) => ({
      name: cat.title,
      bytes: cat.field.bytes as number,
      availability: cat.field.availability,
      detail: cat.field.detail,
    }))

  if (data.length === 0) {
    return (
      <div className="storage-chart-empty">
        <p>Nenhuma categoria com tamanho mensurável no momento. Verifique se o Supabase local está em execução.</p>
      </div>
    )
  }

  return (
    <>
      {!compact ? (
        <p className="analysis-disclaimer">
          Categorias exibidas separadamente — pastas podem se sobrepor; o total identificado não deduplica automaticamente.
        </p>
      ) : (
        <p className="analysis-disclaimer server-acomp-disclaimer-compact">
          Categorias separadas (sem deduplicar sobreposição).
        </p>
      )}
      <ResponsiveContainer
        width="100%"
        height={Math.min(compact ? 200 : 360, data.length * (compact ? 34 : 48) + (compact ? 36 : 60))}
      >
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false} />
          <XAxis type="number" tickFormatter={formatAxisBytes} stroke={theme.muted} fontSize={12} />
          <YAxis type="category" dataKey="name" width={160} stroke={theme.muted} fontSize={11} tick={{ fill: theme.text }} />
          <Tooltip
            formatter={(value, _n, item) => {
              const row = item.payload as { availability?: string; detail?: string }
              return [
                `${tooltipBytesFromUnknown(value)}${availabilityNote(row.availability ?? 'measured')}`,
                row.detail ?? 'Categoria',
              ]
            }}
            contentStyle={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              color: theme.text,
            }}
          />
          <Bar dataKey="bytes" fill={theme.accentSoft} radius={[0, 6, 6, 0]} animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </>
  )
}
