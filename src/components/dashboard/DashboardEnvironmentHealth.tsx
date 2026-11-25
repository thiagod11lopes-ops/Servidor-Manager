import type { DashboardOperationalStatus } from '../../types/monitoring.ts'
import {
  operationalComponentStatusLabel,
  operationalComponentStatusTone,
} from '../../utils/dashboardOperationalLabels.ts'

type DashboardEnvironmentHealthProps = {
  operational: DashboardOperationalStatus
}

export function DashboardEnvironmentHealth({ operational }: DashboardEnvironmentHealthProps) {
  return (
    <section className="analysis-panel dashboard-env-health" aria-label="Saúde do ambiente">
      <div className="dashboard-section-heading">
        <h2 className="analysis-title">Saúde do ambiente</h2>
        <p className="analysis-disclaimer">
          Componentes essenciais deste computador servidor — serviço local, preparação, Docker quando
          aplicável, sistemas instalados e alertas.
        </p>
      </div>
      <ul className="dashboard-env-health-list">
        {operational.details.map((item) => {
          const tone = operationalComponentStatusTone(item.status)
          const statusLabel = operationalComponentStatusLabel(item.status)
          return (
            <li key={item.id} className="dashboard-env-health-row">
              <div className="dashboard-env-health-row-head">
                <span className="dashboard-env-health-component">{item.label}</span>
                <span className={`dashboard-env-health-status dashboard-operational-tone-${tone}`}>
                  {statusLabel}
                </span>
              </div>
              <p className="analysis-meta dashboard-env-health-message">{item.message}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
