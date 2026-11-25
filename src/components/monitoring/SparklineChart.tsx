type SparklineChartProps = {
  samples: Array<number | null>
  stroke?: string
  height?: number
  label: string
  /** Preenche a largura do card (aba Servidor). */
  fillArea?: boolean
}

export function SparklineChart({
  samples,
  stroke = 'var(--accent)',
  height = 56,
  label,
  fillArea,
}: SparklineChartProps) {
  const values = samples.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (values.length < 2) {
    return (
      <div className="monitoring-sparkline monitoring-sparkline-empty" aria-label={label}>
        <span className="monitoring-sparkline-placeholder">Sem histórico suficiente</span>
      </div>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const width = 240
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - ((v - min) / span) * (height - 8) - 4
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg
      className={fillArea ? 'monitoring-sparkline monitoring-sparkline-fill' : 'monitoring-sparkline'}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <polyline fill="none" stroke={stroke} strokeWidth="2" points={points} />
    </svg>
  )
}
