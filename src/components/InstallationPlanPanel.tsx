import type { InstallationPlan } from '../types/installationPlan.ts'
import { databaseConfidenceLabel } from '../types/database.ts'

type InstallationPlanPanelProps = {
  loading: boolean
  error?: string
  plan?: InstallationPlan
}

function listOrDash(items: string[]): string {
  return items.length > 0 ? items.join(', ') : '—'
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR')
}

export function InstallationPlanPanel({ loading, error, plan }: InstallationPlanPanelProps) {
  if (loading) {
    return (
      <div className="analysis-panel analysis-panel-loading">
        <p>Gerando plano de instalação...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="analysis-panel analysis-panel-error">
        <p className="analysis-title">Não foi possível gerar o plano</p>
        <p>{error}</p>
      </div>
    )
  }

  if (!plan) return null

  return (
    <div className="analysis-panel plan-panel">
      <div className="analysis-header">
        <p className="analysis-title">Plano de instalação</p>
        <span className="badge badge-plan">PLANO</span>
      </div>
      <p className="plan-disclaimer">{plan.disclaimer}</p>
      <dl className="analysis-grid">
        <div>
          <dt>Projeto</dt>
          <dd>{plan.projectName}</dd>
        </div>
        <div>
          <dt>Confiança</dt>
          <dd>{plan.confidenceLevel}</dd>
        </div>
        <div className="analysis-span">
          <dt>Tecnologia</dt>
          <dd>{plan.technologySummary}</dd>
        </div>
        <div className="analysis-span">
          <dt>Pré-requisitos do sistema</dt>
          <dd>{listOrDash(plan.prerequisites)}</dd>
        </div>
        <div className="analysis-span">
          <dt>Diretório planejado</dt>
          <dd>{plan.plannedInstallDirectory}</dd>
        </div>
        <div className="analysis-span">
          <dt>Dependências do projeto (amostra)</dt>
          <dd>{listOrDash(plan.projectDependencies)}</dd>
        </div>
        <div>
          <dt>Build</dt>
          <dd>{plan.buildCommand ?? '—'}</dd>
        </div>
        <div>
          <dt>Execução</dt>
          <dd>{plan.startCommand ?? plan.devCommand ?? '—'}</dd>
        </div>
        <div className="analysis-span">
          <dt>Portas identificadas</dt>
          <dd>{plan.identifiedPorts.length > 0 ? plan.identifiedPorts.join(', ') : '—'}</dd>
        </div>
        <div>
          <dt>Banco de dados</dt>
          <dd>{plan.databaseRequired ? plan.databaseType : 'Não identificado'}</dd>
        </div>
        {plan.database ? (
          <>
            <div>
              <dt>Confiança (banco)</dt>
              <dd>{databaseConfidenceLabel[plan.database.confidence]}</dd>
            </div>
            <div>
              <dt>Provisionamento</dt>
              <dd>{plan.database.provisioningRequired ? 'Necessário' : 'Não necessário'}</dd>
            </div>
            <div className="analysis-span">
              <dt>Origem da detecção</dt>
              <dd>{plan.database.detectedFrom.length > 0 ? plan.database.detectedFrom.join(' · ') : '—'}</dd>
            </div>
          </>
        ) : null}
        <div className="analysis-span">
          <dt>Variáveis de ambiente</dt>
          <dd>{listOrDash(plan.environmentVariables)}</dd>
        </div>
        <div className="analysis-span">
          <dt>Arquivos de configuração</dt>
          <dd>{listOrDash(plan.configurationFiles)}</dd>
        </div>
        <div className="analysis-span">
          <dt>Avisos</dt>
          <dd>{listOrDash(plan.warnings)}</dd>
        </div>
      </dl>
      <ol className="plan-steps">
        {plan.plannedSteps.map((step) => (
          <li key={step.order}>
            <strong>
              {step.order}. {step.title}
            </strong>
            <span>{step.description}</span>
          </li>
        ))}
      </ol>
      <p className="analysis-meta">Plano gerado em {formatDate(plan.generatedAt)}</p>
    </div>
  )
}
