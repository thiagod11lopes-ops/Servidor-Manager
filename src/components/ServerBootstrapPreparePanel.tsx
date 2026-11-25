import {
  DashboardExpandableCard,
  type DashboardCardStatusTone,
} from './DashboardExpandableCard.tsx'
import type { useServerBootstrap } from '../hooks/useServerBootstrap.ts'

export type ServerBootstrapBind = ReturnType<typeof useServerBootstrap>

type ServerBootstrapPreparePanelProps = {
  bootstrap: ServerBootstrapBind
  expandable?: boolean
}

function isComputerPrepared(bootstrap: ServerBootstrapBind): boolean {
  const { status, job, installBusy } = bootstrap
  const jobActive = job != null && (job.phase === 'running' || job.phase === 'queued')
  if (installBusy || jobActive) return false
  return job?.phase === 'success' || status?.readyForManifestInstall === true
}

function prepareCardStatus(bootstrap: ServerBootstrapBind): { label: string; tone: DashboardCardStatusTone } {
  const { status, loading, error, job, installBusy } = bootstrap
  const jobActive = job != null && (job.phase === 'running' || job.phase === 'queued')

  if (error) {
    return { label: error.length > 80 ? `${error.slice(0, 77)}…` : error, tone: 'error' }
  }
  if (!status?.bootstrapScriptAvailable && status) {
    return { label: 'Scripts de bootstrap indisponíveis', tone: 'error' }
  }
  if (job?.phase === 'error') {
    const msg = job.message ?? 'Preparação falhou'
    return { label: msg.length > 80 ? `${msg.slice(0, 77)}…` : msg, tone: 'error' }
  }
  if (installBusy || jobActive) {
    return { label: 'Preparando…', tone: 'muted' }
  }
  if (isComputerPrepared(bootstrap)) {
    return { label: 'Computador preparado', tone: 'success' }
  }
  if (loading && !status) {
    return { label: 'Verificando…', tone: 'muted' }
  }
  return { label: 'Computador disponível', tone: 'normal' }
}

function PreparePanelBody({ bootstrap }: { bootstrap: ServerBootstrapBind }) {
  const { status, loading, error, job, installBusy, runInstall } = bootstrap
  const jobActive = job != null && (job.phase === 'running' || job.phase === 'queued')
  const prepared = isComputerPrepared(bootstrap)

  const prepareButtonLabel = installBusy
    ? 'Preparando…'
    : prepared
      ? 'Preparar novamente'
      : 'Preparar este computador'

  return (
    <>
      {prepared && status ? (
        <>
          <dl className="analysis-grid bootstrap-compact-facts dashboard-prepare-status-grid">
            <div>
              <dt>Estado</dt>
              <dd className="dashboard-prepare-status-ok">Computador preparado</dd>
            </div>
            <div>
              <dt>Pré-requisitos básicos</dt>
              <dd>{status.ok ? 'Verificados' : 'Pendentes — revise o painel acima'}</dd>
            </div>
            <div>
              <dt>Pronto para perfil manifest</dt>
              <dd>{status.readyForManifestInstall ? 'Sim' : 'Não confirmado'}</dd>
            </div>
            <div>
              <dt>Docker</dt>
              <dd>
                {status.docker.installed
                  ? status.docker.running
                    ? 'Em execução'
                    : 'Instalado — parado'
                  : 'Não instalado'}
              </dd>
            </div>
          </dl>
          {job?.phase === 'success' ? (
            <p className="analysis-disclaimer">
              Última preparação concluída com sucesso
              {job.finishedAt ? ` (${new Date(job.finishedAt).toLocaleString('pt-BR')})` : ''}.
            </p>
          ) : status.readyForManifestInstall ? (
            <p className="analysis-disclaimer">
              Preparação confirmada pelo serviço local. Você pode executar novamente se precisar reinstalar
              dependências.
            </p>
          ) : null}
        </>
      ) : (
        <p className="analysis-disclaimer">
          Executa o script de preparação do perfil <code>supabase-local-v1</code> (winget/Docker conforme necessário).
          Revise os pré-requisitos no painel acima antes de iniciar.
        </p>
      )}

      {error ? <p className="field-error">{error}</p> : null}

      {jobActive ? (
        <p className="analysis-meta bootstrap-job-inline">
          Job {job.jobId.slice(0, 8)}… — {job.phase}
          {job.message ? `: ${job.message}` : ''}
        </p>
      ) : null}

      {job?.phase === 'error' ? (
        <p className="field-error">
          Preparação falhou{job.message ? `: ${job.message}` : ''}. Detalhes em “Detalhes técnicos”.
        </p>
      ) : null}

      <div className="system-actions dashboard-prepare-actions">
        <button
          type="button"
          className="button button-primary button-small dashboard-prepare-button"
          disabled={loading || installBusy || status?.bootstrapScriptAvailable === false}
          onClick={() => void runInstall({ launchDockerDesktop: true })}
        >
          {prepareButtonLabel}
        </button>
      </div>

      {!status?.bootstrapScriptAvailable && status ? (
        <p className="field-error">
          Scripts de bootstrap não encontrados. Reinstale pelo <code>servidor.exe</code>.
        </p>
      ) : null}
    </>
  )
}

export function ServerBootstrapPreparePanel({ bootstrap, expandable }: ServerBootstrapPreparePanelProps) {
  const cardStatus = prepareCardStatus(bootstrap)

  if (expandable) {
    return (
      <DashboardExpandableCard
        title="Preparar este computador"
        status={cardStatus.label}
        statusTone={cardStatus.tone}
        className="dashboard-prepare-panel"
      >
        <PreparePanelBody bootstrap={bootstrap} />
      </DashboardExpandableCard>
    )
  }

  return (
    <section className="analysis-panel dashboard-prepare-panel" aria-labelledby="dashboard-prepare-title">
      <div className="analysis-header">
        <p id="dashboard-prepare-title" className="analysis-title">
          Preparar este computador
        </p>
        <span className={`dashboard-expandable-status dashboard-expandable-status-${cardStatus.tone}`}>
          {cardStatus.label}
        </span>
      </div>
      <PreparePanelBody bootstrap={bootstrap} />
    </section>
  )
}
