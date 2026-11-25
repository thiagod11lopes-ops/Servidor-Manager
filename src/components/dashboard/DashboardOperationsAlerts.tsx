import type { DashboardOperationalStatus } from '../../types/monitoring.ts'
import type { DashboardInstalledSystemRow } from '../../types/dashboard.ts'
import {
  operationalComponentStatusLabel,
  operationalComponentStatusTone,
} from '../../utils/dashboardOperationalLabels.ts'

type DashboardOperationsAlertsProps = {
  operational: DashboardOperationalStatus
  installedSystems: DashboardInstalledSystemRow[]
  onOpenSystems: () => void
}

export function DashboardOperationsAlerts({
  operational,
  installedSystems,
  onOpenSystems,
}: DashboardOperationsAlertsProps) {
  const problems = operational.details.filter((item) => item.status === 'warn' || item.status === 'fail')
  const systemsInError = installedSystems.filter((row) => row.state === 'erro')

  if (problems.length === 0 && systemsInError.length === 0) {
    return (
      <section className="analysis-panel dashboard-operations-panel" aria-label="Falhas e operações">
        <h2 className="analysis-title">Falhas e operações</h2>
        <p className="analysis-disclaimer">Nenhuma falha crítica nem operação pendente reportada neste ciclo.</p>
      </section>
    )
  }

  return (
    <section className="analysis-panel dashboard-operations-panel" aria-label="Falhas e operações">
      <div className="dashboard-section-heading">
        <h2 className="analysis-title">Falhas e operações</h2>
        <button type="button" className="link-button" onClick={onOpenSystems}>
          Abrir Meus Sistemas
        </button>
      </div>

      {systemsInError.length > 0 ? (
        <>
          <h3 className="dashboard-operations-subtitle">Sistemas com erro</h3>
          <ul className="dashboard-operations-system-errors">
            {systemsInError.map((row) => (
              <li key={row.systemId}>
                <strong>{row.label}</strong>
                <span className="analysis-meta"> — {row.lastError ?? row.stateLabel}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {problems.length > 0 ? (
        <ul className="dashboard-operational-problems">
          {problems.map((item) => {
            const tone = operationalComponentStatusTone(item.status)
            return (
              <li key={item.id} className="dashboard-operational-problem">
                <div className="dashboard-env-health-row-head">
                  <span className="dashboard-env-health-component">{item.label}</span>
                  <span className={`dashboard-env-health-status dashboard-operational-tone-${tone}`}>
                    {operationalComponentStatusLabel(item.status)}
                  </span>
                </div>
                <p className="analysis-meta">{item.message}</p>
                {item.solutions && item.solutions.length > 0 ? (
                  <ul className="dashboard-operational-solutions">
                    {item.solutions.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
