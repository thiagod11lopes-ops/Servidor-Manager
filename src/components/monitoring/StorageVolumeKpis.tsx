import type { VolumeStorageSnapshot } from '../../types/monitoring.ts'
import { formatBytes } from '../../utils/formatBytes.ts'

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

type StorageVolumeKpisProps = {
  volume: VolumeStorageSnapshot | undefined
}

export function StorageVolumeKpis({ volume }: StorageVolumeKpisProps) {
  if (!volume) {
    return (
      <div className="server-metric-strip server-storage-kpi-strip">
        <article className="metric-card server-strip-card">
          <p className="metric-label">Armazenamento</p>
          <p className="metric-value">—</p>
          <p className="metric-detail">Aguardando coleta</p>
        </article>
      </div>
    )
  }

  return (
    <div className="server-metric-strip server-storage-kpi-strip" aria-label="Resumo de armazenamento">
      <article className="metric-card server-strip-card">
        <p className="metric-label">Capacidade</p>
        <p className="metric-value">{volume.totalBytes != null ? formatBytes(volume.totalBytes) : '—'}</p>
        <p className="metric-detail">{volume.label}</p>
      </article>
      <article className="metric-card server-strip-card">
        <p className="metric-label">Utilizado</p>
        <p className="metric-value">{volume.usedBytes != null ? formatBytes(volume.usedBytes) : '—'}</p>
        <p className="metric-detail">
          {volume.usedPercent != null ? `${volume.usedPercent}%` : volume.detail ?? '—'}
        </p>
      </article>
      <article className="metric-card server-strip-card">
        <p className="metric-label">Disponível</p>
        <p className="metric-value">
          {volume.availableBytes != null ? formatBytes(volume.availableBytes) : '—'}
        </p>
        <p className="metric-detail">Espaço livre</p>
      </article>
      <article className="metric-card server-strip-card">
        <p className="metric-label">Estado disco</p>
        <p className="metric-value server-strip-state">{capacityLabel(volume.capacityState)}</p>
        <p className="metric-detail">{new Date(volume.collectedAt).toLocaleString('pt-BR')}</p>
      </article>
    </div>
  )
}
