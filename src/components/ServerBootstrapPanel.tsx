import { CollapsibleSection } from './CollapsibleSection.tsx'
import {
  DashboardExpandableCard,
  type DashboardCardStatusTone,
} from './DashboardExpandableCard.tsx'
import type { ServerBootstrapBind } from './ServerBootstrapPreparePanel.tsx'
import { useServerBootstrap } from '../hooks/useServerBootstrap.ts'
import { dependencyStateLabel, type DependencyState } from '../types/serverBootstrap.ts'

type ServerBootstrapPanelProps = {
  bootstrap?: ServerBootstrapBind
  omitPrepareButton?: boolean
  expandable?: boolean
}

function isDependencyOk(state: DependencyState): boolean {
  return state === 'ok' || state === 'not_applicable'
}

function bootstrapCardStatus(
  loading: boolean,
  error: string | undefined,
  showReady: boolean,
  hasStatus: boolean,
): { label: string; tone: DashboardCardStatusTone } {
  if (error) {
    return { label: error.length > 72 ? `${error.slice(0, 69)}…` : error, tone: 'error' }
  }
  if (loading && !hasStatus) return { label: 'Verificando…', tone: 'muted' }
  if (showReady) return { label: 'Pré-requisitos verificados', tone: 'success' }
  if (hasStatus) return { label: 'Pré-requisitos pendentes', tone: 'normal' }
  return { label: 'Aguardando verificação', tone: 'muted' }
}

function BootstrapPanelBody({
  status,
  loading,
  error,
  job,
  logTail,
  installBusy,
  refresh,
  runInstall,
  omitPrepareButton,
  showReady,
  criticalIssues,
  optionalIssues,
}: {
  status: ServerBootstrapBind['status']
  loading: boolean
  error: string | undefined
  job: ServerBootstrapBind['job']
  logTail: string
  installBusy: boolean
  refresh: ServerBootstrapBind['refresh']
  runInstall: ServerBootstrapBind['runInstall']
  omitPrepareButton?: boolean
  showReady: boolean
  criticalIssues: NonNullable<ServerBootstrapBind['status']>['dependencies']
  optionalIssues: NonNullable<ServerBootstrapBind['status']>['dependencies']
}) {
  return (
    <>
      <p className="analysis-disclaimer bootstrap-profile-line">
        Perfil <code>supabase-local-v1</code> · verificação automática (nada instala sem sua ação)
      </p>

      {error ? <p className="field-error">{error}</p> : null}
      {status && !showReady && !loading ? (
        <p className="bootstrap-pending-banner" role="status">
          Preparação <strong>não concluída</strong>
          {status.summary ? `: ${status.summary}` : '.'}
        </p>
      ) : null}

      {status ? (
        <>
          <dl className="analysis-grid bootstrap-compact-facts">
            <div>
              <dt>Sistema</dt>
              <dd>{status.os.label}</dd>
            </div>
            <div>
              <dt>Administrador</dt>
              <dd>{status.isAdmin ? 'Sim' : 'Não (UAC)'}</dd>
            </div>
            <div>
              <dt>winget</dt>
              <dd>{status.wingetAvailable ? 'Disponível' : 'Instale App Installer'}</dd>
            </div>
            <div>
              <dt>Docker</dt>
              <dd>
                {status.docker.installed
                  ? status.docker.running
                    ? 'Em execução'
                    : 'Parado'
                  : 'Não instalado'}
              </dd>
            </div>
          </dl>

          {criticalIssues.length > 0 ? (
            <ul className="bootstrap-dep-summary bootstrap-dep-summary-critical">
              {criticalIssues.map((dep) => (
                <li key={dep.id}>
                  <strong>{dep.label}</strong>: {dependencyStateLabel(dep.state)} — {dep.detail}
                </li>
              ))}
            </ul>
          ) : showReady ? (
            <p className="analysis-disclaimer bootstrap-dep-summary-ok">
              Dependências críticas verificadas ({status.dependencies.filter((d) => d.critical).length}{' '}
              itens).
            </p>
          ) : (
            <p className="analysis-disclaimer">Revise dependências em “Detalhes técnicos”.</p>
          )}

          {optionalIssues.length > 0 ? (
            <p className="analysis-disclaimer bootstrap-optional-hint">
              Opcionais pendentes: {optionalIssues.map((d) => d.label).join(', ')}.
            </p>
          ) : null}

          <CollapsibleSection title="Detalhes técnicos (tabela, logs e avisos)" defaultOpen={false}>
            <p className="analysis-disclaimer">
              Dados em <code>C:\ServidorManager</code> não são alterados nesta etapa.
            </p>
            {status.summary ? <p className="analysis-disclaimer">{status.summary}</p> : null}

            {status.dependencies.length > 0 ? (
              <table className="bootstrap-deps-table">
                <thead>
                  <tr>
                    <th>Dependência</th>
                    <th>Estado</th>
                    <th>Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {status.dependencies.map((dep) => (
                    <tr key={dep.id} className={`bootstrap-dep bootstrap-dep-${dep.state}`}>
                      <td>
                        {dep.label}
                        {dep.critical ? '' : ' (opcional)'}
                      </td>
                      <td>{dependencyStateLabel(dep.state)}</td>
                      <td>{dep.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {status.hints.map((hint) => (
              <p key={hint.id} className={`analysis-disclaimer bootstrap-hint-${hint.severity}`}>
                {hint.message}
              </p>
            ))}

            {job ? (
              <div className="bootstrap-job">
                <p className="analysis-meta">
                  Job {job.jobId.slice(0, 8)}… — {job.phase}
                  {job.outcome ? ` (${job.outcome})` : ''}
                  {job.message ? ` — ${job.message}` : ''}
                </p>
                {logTail ? <pre className="bootstrap-log">{logTail}</pre> : null}
              </div>
            ) : null}

            {showReady ? (
              <p className="analysis-disclaimer bootstrap-ready-note">
                Ferramentas do perfil <code>supabase-local-v1</code> verificadas. Instalar sistemas exige também{' '}
                <strong>Analisar</strong> o manifesto em <strong>Meus Sistemas</strong>.
              </p>
            ) : null}
          </CollapsibleSection>
        </>
      ) : null}

      {!omitPrepareButton && job && (job.phase === 'running' || job.phase === 'queued') ? (
        <p className="analysis-meta bootstrap-job-inline">
          Preparação em andamento — {job.phase}
          {job.message ? `: ${job.message}` : ''}
        </p>
      ) : null}

      <div className="system-actions bootstrap-panel-actions">
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={loading || installBusy}
          onClick={() => void refresh()}
        >
          {loading ? 'Verificando…' : 'Verificar de novo'}
        </button>
        {!omitPrepareButton ? (
          <button
            type="button"
            className="button button-primary button-small"
            disabled={loading || installBusy || status?.bootstrapScriptAvailable === false}
            onClick={() => void runInstall({ launchDockerDesktop: true })}
          >
            {installBusy ? 'Preparando…' : 'Preparar este computador'}
          </button>
        ) : null}
      </div>

      {!omitPrepareButton && !status?.bootstrapScriptAvailable && status ? (
        <p className="field-error">
          Scripts de bootstrap não encontrados no pacote. Reinstale pelo <code>servidor.exe</code>.
        </p>
      ) : null}
    </>
  )
}

export function ServerBootstrapPanel({
  bootstrap: bootstrapProp,
  omitPrepareButton,
  expandable,
}: ServerBootstrapPanelProps = {}) {
  const internal = useServerBootstrap()
  const { status, loading, error, job, logTail, installBusy, refresh, runInstall } = bootstrapProp ?? internal

  const showReady = status?.ok === true
  const criticalIssues =
    status?.dependencies.filter((dep) => dep.critical && !isDependencyOk(dep.state)) ?? []
  const optionalIssues =
    status?.dependencies.filter((dep) => !dep.critical && !isDependencyOk(dep.state)) ?? []

  const body = (
    <BootstrapPanelBody
      status={status}
      loading={loading}
      error={error}
      job={job}
      logTail={logTail}
      installBusy={installBusy}
      refresh={refresh}
      runInstall={runInstall}
      omitPrepareButton={omitPrepareButton}
      showReady={showReady}
      criticalIssues={criticalIssues}
      optionalIssues={optionalIssues}
    />
  )

  if (expandable) {
    const cardStatus = bootstrapCardStatus(loading, error, showReady, status != null)
    return (
      <DashboardExpandableCard
        id="server-bootstrap-panel"
        title="Preparar este PC como servidor"
        status={cardStatus.label}
        statusTone={cardStatus.tone}
        className="server-bootstrap-panel"
      >
        {body}
      </DashboardExpandableCard>
    )
  }

  return (
    <section id="server-bootstrap-panel" className="analysis-panel server-bootstrap-panel">
      <div className="analysis-header">
        <p className="analysis-title">Preparar este PC como servidor</p>
        <span
          className={`badge ${showReady ? 'badge-real bootstrap-badge-verified' : 'badge-mock'}`}
        >
          {loading ? '…' : showReady ? 'PRÉ-REQUISITOS BÁSICOS VERIFICADOS' : 'PENDENTE'}
        </span>
      </div>
      {body}
    </section>
  )
}
