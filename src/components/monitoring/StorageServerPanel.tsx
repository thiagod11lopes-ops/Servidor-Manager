import { CollapsibleSection } from '../CollapsibleSection.tsx'
import type { LiveMetricsSnapshot, VolumeStorageSnapshot } from '../../types/monitoring.ts'
import { formatBytes } from '../../utils/formatBytes.ts'
import { StorageVolumeDonut } from './charts/StorageVolumeDonut.tsx'
import { VolumeStackedBars } from './charts/VolumeStackedBars.tsx'

function capacityLabel(state: VolumeStorageSnapshot['capacityState']): string {
  switch (state) {
    case 'attention':
      return 'Atenção'
    case 'critical':
      return 'Crítico'
    case 'severe':
      return 'Muito crítico'
    case 'normal':
      return 'Normal'
    default:
      return 'Sem dados'
  }
}

type StorageServerPanelProps = {
  live: LiveMetricsSnapshot | null
  loading: boolean
  error: string | null
  compact?: boolean
}

export function StorageServerPanel({ live, loading, error, compact }: StorageServerPanelProps) {
  const primary = live?.volumes[0]
  const extraVolumes = live?.volumes.slice(1) ?? []

  return (
    <section
      className={`analysis-panel monitoring-panel storage-dashboard-panel${compact ? ' storage-dashboard-panel-compact' : ''}`}
      aria-labelledby="storage-server-title"
    >
      <div className="analysis-header">
        <p id="storage-server-title" className="analysis-title">
          Armazenamento do servidor
        </p>
        {loading ? <span className="badge badge-mock">Coletando…</span> : null}
        {error ? <span className="badge badge-mock">Indisponível</span> : null}
      </div>

      {error ? <p className="field-error">Não foi possível consultar: {error}</p> : null}

      {loading && !primary ? (
        <div className="storage-chart-empty">
          <p>Carregando métricas de armazenamento…</p>
        </div>
      ) : null}

      {!loading && !error && !primary ? (
        <div className="storage-chart-empty">
          <p>Aguardando primeira coleta de armazenamento.</p>
        </div>
      ) : null}

      {primary ? (
        <>
          <div className="storage-summary-grid">
            <div className="storage-kpi-grid">
              <article className="metric-card storage-kpi-card">
                <p className="metric-label">Capacidade total</p>
                <p className="metric-value storage-kpi-value">
                  {primary.totalBytes != null ? formatBytes(primary.totalBytes) : 'Indisponível'}
                </p>
                <p className="metric-detail">{primary.label}</p>
              </article>
              <article className="metric-card storage-kpi-card">
                <p className="metric-label">Utilizado</p>
                <p className="metric-value storage-kpi-value">
                  {primary.usedBytes != null ? formatBytes(primary.usedBytes) : 'Indisponível'}
                </p>
                <p className="metric-detail">
                  {primary.usedPercent != null ? `${primary.usedPercent}% do volume` : primary.detail ?? '—'}
                </p>
              </article>
              <article className="metric-card storage-kpi-card">
                <p className="metric-label">Disponível</p>
                <p className="metric-value storage-kpi-value">
                  {primary.availableBytes != null ? formatBytes(primary.availableBytes) : 'Indisponível'}
                </p>
                <p className="metric-detail">Espaço livre para gravação</p>
              </article>
              <article className="metric-card storage-kpi-card">
                <p className="metric-label">Estado</p>
                <p className="metric-value storage-kpi-value storage-kpi-state">{capacityLabel(primary.capacityState)}</p>
                <p className="metric-detail">
                  Atualizado {new Date(primary.collectedAt).toLocaleString('pt-BR')}
                </p>
              </article>
            </div>
            <div className="storage-donut-card">
              {!compact ? <p className="monitoring-chart-subtitle">Distribuição do volume principal</p> : null}
              <StorageVolumeDonut volume={primary} compact={compact} />
            </div>
          </div>

          {primary.detail && !compact ? <p className="analysis-disclaimer">{primary.detail}</p> : null}
          {primary.detail && compact ? (
            <p className="analysis-disclaimer storage-volume-detail-compact">{primary.detail}</p>
          ) : null}

          {extraVolumes.length > 0 ? (
            <CollapsibleSection
              title={`Comparativo por volume (${extraVolumes.length + 1} volumes)`}
              defaultOpen={!compact}
            >
              <VolumeStackedBars volumes={[primary, ...extraVolumes]} compact={compact} />
            </CollapsibleSection>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
