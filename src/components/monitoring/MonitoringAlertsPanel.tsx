import type { MonitoringAlert } from '../../types/monitoring.ts'

type MonitoringAlertsPanelProps = {
  alerts: MonitoringAlert[]
  loading: boolean
  error: string | null
  compact?: boolean
}

export function MonitoringAlertsPanel({ alerts, loading, error, compact }: MonitoringAlertsPanelProps) {
  return (
    <section
      className={`analysis-panel monitoring-panel${compact ? ' monitoring-alerts-compact' : ''}`}
      aria-labelledby="monitoring-alerts-title"
    >
      <div className="analysis-header">
        <p id="monitoring-alerts-title" className="analysis-title">
          Alertas de capacidade
        </p>
        {loading ? <span className="badge badge-mock">…</span> : null}
      </div>
      {error ? <p className="field-error">{error}</p> : null}
      {alerts.length === 0 && !loading ? (
        <p className="analysis-disclaimer">Nenhum alerta ativo no momento.</p>
      ) : (
        <ul className="monitoring-alert-list">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`monitoring-alert monitoring-alert-${alert.severity}`}
            >
              <strong>{alert.title}</strong>
              <span>{alert.message}</span>
              <span className="analysis-meta">
                {new Date(alert.lastSeenAt).toLocaleString('pt-BR')}
                {alert.volumePath ? ` · ${alert.volumePath}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
