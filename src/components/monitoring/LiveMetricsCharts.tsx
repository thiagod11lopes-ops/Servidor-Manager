import type { HistorySample, LiveMetricsSnapshot } from '../../types/monitoring.ts'
import { formatBytes } from '../../utils/formatBytes.ts'
import { SparklineChart } from './SparklineChart.tsx'

type LiveMetricsChartsProps = {
  live: LiveMetricsSnapshot | null
  history: HistorySample[]
  loading: boolean
  error: string | null
  /** strip = KPIs superiores; sparklines = gráficos centrais; all = painel legado completo */
  part?: 'strip' | 'sparklines' | 'all'
}

function formatRate(bytesPerSec: number | null): string {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec)) return 'Indisponível'
  return `${formatBytes(bytesPerSec)}/s`
}

export function LiveMetricsCharts({
  live,
  history,
  loading,
  error,
  part = 'all',
}: LiveMetricsChartsProps) {
  if (part === 'strip') {
    return (
      <div className="server-metric-strip server-live-kpi-strip" aria-label="Funcionamento em tempo real">
        <article className="metric-card server-strip-card">
          <p className="metric-label">CPU</p>
          <p className="metric-value">
            {live?.cpuUsagePercent != null ? `${Math.round(live.cpuUsagePercent)}%` : '—'}
          </p>
          <p className="metric-detail">{live?.cpuDetail ?? '—'}</p>
        </article>
        <article className="metric-card server-strip-card">
          <p className="metric-label">RAM</p>
          <p className="metric-value">
            {live?.memoryUsedPercent != null ? `${live.memoryUsedPercent}%` : '—'}
          </p>
          <p className="metric-detail">{live?.memoryDetail ?? '—'}</p>
        </article>
        <article className="metric-card server-strip-card">
          <p className="metric-label">Rede ↓</p>
          <p className="metric-value">{formatRate(live?.networkBytesInPerSec ?? null)}</p>
          <p className="metric-detail">{live?.networkDetail ?? '—'}</p>
        </article>
        <article className="metric-card server-strip-card">
          <p className="metric-label">Rede ↑</p>
          <p className="metric-value">{formatRate(live?.networkBytesOutPerSec ?? null)}</p>
          <p className="metric-detail">{live?.networkDetail ?? '—'}</p>
        </article>
        {loading ? <span className="badge badge-mock server-strip-badge">CPU/RAM…</span> : null}
        {error ? <p className="field-error server-strip-error">{error}</p> : null}
      </div>
    )
  }

  const sparklineGrid = (
    <div className="server-hardware-grid">
      <article className="metric-card server-hardware-card">
        <p className="metric-label">CPU — 24h</p>
        <SparklineChart samples={history.map((h) => h.cpu)} label="Histórico de CPU" height={64} fillArea />
      </article>
      <article className="metric-card server-hardware-card">
        <p className="metric-label">RAM — 24h</p>
        <SparklineChart
          samples={history.map((h) => h.mem)}
          label="Histórico de memória"
          stroke="var(--success)"
          height={64}
          fillArea
        />
      </article>
      <article className="metric-card server-hardware-card">
        <p className="metric-label">Rede entrada — 24h</p>
        <SparklineChart samples={history.map((h) => h.netIn)} label="Histórico rede entrada" height={64} fillArea />
      </article>
      <article className="metric-card server-hardware-card">
        <p className="metric-label">Rede saída — 24h</p>
        <SparklineChart samples={history.map((h) => h.netOut)} label="Histórico rede saída" height={64} fillArea />
      </article>
    </div>
  )

  if (part === 'sparklines') {
    return (
      <>
        {live?.collectionError ? <p className="analysis-disclaimer">{live.collectionError}</p> : null}
        {sparklineGrid}
      </>
    )
  }

  return (
    <section className="analysis-panel monitoring-panel server-functioning-panel" aria-labelledby="live-metrics-title">
      <div className="analysis-header">
        <p id="live-metrics-title" className="analysis-title">
          Funcionamento em tempo real
        </p>
        <div className="server-panel-header-meta">
          {loading ? <span className="badge badge-mock">Coletando…</span> : null}
          {live?.collectedAt ? (
            <span className="analysis-meta server-collected-at">
              {new Date(live.collectedAt).toLocaleString('pt-BR')}
            </span>
          ) : null}
        </div>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
      {live?.collectionError ? <p className="analysis-disclaimer">{live.collectionError}</p> : null}

      <div className="monitoring-live-grid">
        <article className="metric-card monitoring-metric-card">
          <p className="metric-label">CPU</p>
          <p className="metric-value">
            {live?.cpuUsagePercent != null ? `${Math.round(live.cpuUsagePercent)}%` : 'Indisponível'}
          </p>
          <p className="metric-detail">{live?.cpuDetail ?? '—'}</p>
          <SparklineChart samples={history.map((h) => h.cpu)} label="Histórico de CPU" />
        </article>
        <article className="metric-card monitoring-metric-card">
          <p className="metric-label">Memória RAM</p>
          <p className="metric-value">
            {live?.memoryUsedPercent != null ? `${live.memoryUsedPercent}%` : 'Indisponível'}
          </p>
          <p className="metric-detail">{live?.memoryDetail ?? '—'}</p>
          <SparklineChart samples={history.map((h) => h.mem)} label="Histórico de memória" stroke="var(--success)" />
        </article>
        <article className="metric-card monitoring-metric-card">
          <p className="metric-label">Rede (entrada)</p>
          <p className="metric-value">{formatRate(live?.networkBytesInPerSec ?? null)}</p>
          <p className="metric-detail">{live?.networkDetail ?? '—'}</p>
          <SparklineChart samples={history.map((h) => h.netIn)} label="Histórico rede entrada" />
        </article>
        <article className="metric-card monitoring-metric-card">
          <p className="metric-label">Rede (saída)</p>
          <p className="metric-value">{formatRate(live?.networkBytesOutPerSec ?? null)}</p>
          <p className="metric-detail">{live?.networkDetail ?? '—'}</p>
          <SparklineChart samples={history.map((h) => h.netOut)} label="Histórico rede saída" />
        </article>
      </div>
    </section>
  )
}
