import type { DashboardOperationalDetail, DashboardOperationalStatus } from '../../types/monitoring.ts'
import {
  OPERATIONAL_HEALTH_DEFINITIONS,
  operationalHealthTone,
} from '../../utils/operationalHealthCatalog.ts'

type DashboardOperationalStatusDetailsProps = {
  operational: DashboardOperationalStatus
}

function detailBadge(status: DashboardOperationalDetail['status']): string {
  if (status === 'ok') return 'badge badge-real'
  if (status === 'fail') return 'badge badge-mock'
  if (status === 'warn') return 'badge badge-plan'
  return 'badge'
}

function ProblemSolutionItem({ item }: { item: DashboardOperationalDetail }) {
  return (
    <li className="dashboard-operational-problem">
      <div className="dashboard-operational-check-row">
        <span className={detailBadge(item.status)}>{item.label}</span>
      </div>
      <p className="dashboard-operational-problem-text">{item.message}</p>
      {item.solutions && item.solutions.length > 0 ? (
        <>
          <p className="dashboard-operational-solutions-title">Possíveis soluções</p>
          <ul className="dashboard-operational-solutions">
            {item.solutions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
    </li>
  )
}

export function DashboardOperationalStatusDetails({ operational }: DashboardOperationalStatusDetailsProps) {
  const tone = operationalHealthTone(operational.level)
  const isOperational = operational.level === 'operational'
  const problemDetails = operational.details.filter(
    (item) => item.status === 'warn' || item.status === 'fail',
  )

  return (
    <section
      className="analysis-panel dashboard-operational-details"
      aria-label="Detalhes do status operacional"
    >
      <p className="analysis-disclaimer dashboard-operational-current">
        Condição actual:{' '}
        <span className={`dashboard-operational-current-label dashboard-operational-tone-${tone}`}>
          {operational.label}
        </span>
        {' — '}
        {operational.summary}
      </p>

      {isOperational ? (
        <>
          <h3 className="analysis-title dashboard-operational-subtitle">Níveis de status</h3>
          <ul className="dashboard-operational-definitions">
            {OPERATIONAL_HEALTH_DEFINITIONS.map((item) => {
              const active = item.level === operational.level
              return (
                <li
                  key={item.level}
                  className={`dashboard-operational-definition${active ? ' is-active' : ''}`}
                >
                  <span className="dashboard-operational-definition-label">{item.label}</span>
                  <span className="analysis-meta">{item.description}</span>
                </li>
              )
            })}
          </ul>

          {operational.details.length > 0 ? (
            <>
              <h3 className="analysis-title dashboard-operational-subtitle">Verificações deste servidor</h3>
              <ul className="dashboard-operational-checks">
                {operational.details.map((item) => (
                  <li key={item.id} className="dashboard-operational-check">
                    <div className="dashboard-operational-check-row">
                      <span className={detailBadge(item.status)}>{item.label}</span>
                    </div>
                    <p className="analysis-meta">{item.message}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <>
          <h3 className="analysis-title dashboard-operational-subtitle">Problemas detectados</h3>
          {problemDetails.length === 0 ? (
            <p className="analysis-disclaimer">
              Nenhum item crítico listado neste ciclo; o nível {operational.label} reflecte outras
              verificações em curso.
            </p>
          ) : (
            <ul className="dashboard-operational-problems">
              {problemDetails.map((item) => (
                <ProblemSolutionItem key={item.id} item={item} />
              ))}
            </ul>
          )}

          <h3 className="analysis-title dashboard-operational-subtitle">Referência — nível actual</h3>
          <ul className="dashboard-operational-definitions">
            {OPERATIONAL_HEALTH_DEFINITIONS.filter((item) => item.level === operational.level).map(
              (item) => (
                <li key={item.level} className="dashboard-operational-definition is-active">
                  <span className="dashboard-operational-definition-label">{item.label}</span>
                  <span className="analysis-meta">{item.description}</span>
                </li>
              ),
            )}
          </ul>
        </>
      )}
    </section>
  )
}
