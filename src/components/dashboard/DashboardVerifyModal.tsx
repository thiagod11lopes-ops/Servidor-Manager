import { useEffect, type ReactNode } from 'react'
import type { DashboardInstalledSystemRow } from '../../types/dashboard.ts'
import type { DashboardUnifiedItem } from '../../types/dashboardUnified.ts'
import type { CpuMetrics, MemoryMetrics, ServerInstalledInventory } from '../../types/managerService.ts'
import type { DatabaseSummary } from '../../types/database.ts'
import type { DashboardOperationalDetail, DashboardOperationalStatus, OnlineUsersOverview } from '../../types/monitoring.ts'
import {
  dependencyStateLabel,
  type ServerBootstrapStatus,
  type BootstrapJobRecord,
} from '../../types/serverBootstrap.ts'
import { buildDashboardInstalledSystemsDisplay } from '../../utils/dashboardInstalledInventory.ts'
import { operationalComponentStatusLabel } from '../../utils/dashboardOperationalLabels.ts'
import { OPERATIONAL_HEALTH_DEFINITIONS, operationalHealthTone } from '../../utils/operationalHealthCatalog.ts'

export type DashboardVerifyModalProps = {
  item: DashboardUnifiedItem
  verifying: boolean
  metricsReady: boolean
  lastUpdatedAt: string | null
  operational: DashboardOperationalStatus
  installedInventory: ServerInstalledInventory
  databaseSummary: DatabaseSummary
  cpu: CpuMetrics
  memory: MemoryMetrics
  onlineUsers: OnlineUsersOverview
  installedSystems: DashboardInstalledSystemRow[]
  bootstrapStatus: ServerBootstrapStatus | null
  bootstrapError: string | undefined
  bootstrapJob: BootstrapJobRecord | null
  bootstrapLogTail: string
  bootstrapInstallBusy: boolean
  bootstrapPrepared: boolean
  onClose: () => void
  onRepeatVerify: () => void
  onOpenSystems: () => void
  onOpenServer: (systemId?: string) => void
  onBootstrapRefresh: () => void
  onBootstrapPrepare: () => void
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'Não disponível'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
  } catch {
    return iso
  }
}

function truncateLogTail(tail: string, maxLines = 6): string {
  const lines = tail.trim().split(/\r?\n/)
  if (lines.length <= maxLines) return tail.trim()
  return lines.slice(-maxLines).join('\n')
}

function DetailChecks({ details }: { details: DashboardOperationalDetail[] }) {
  return (
    <ul className="dashboard-verify-checks">
      {details.map((d) => (
        <li key={d.id}>
          <span className="dashboard-verify-check-label">{d.label}</span>
          <span className="dashboard-verify-check-status">{operationalComponentStatusLabel(d.status)}</span>
          <span className="dashboard-verify-check-msg">{d.message}</span>
        </li>
      ))}
    </ul>
  )
}

function ProblemsColumn({
  problems,
  emptyMessage,
}: {
  problems: { title: string; message: string; solutions: string[] }[]
  emptyMessage: string
}) {
  if (problems.length === 0) {
    return <p className="dashboard-verify-ok-msg">{emptyMessage}</p>
  }
  return (
    <ul className="dashboard-verify-problems">
      {problems.map((p) => (
        <li key={p.title}>
          <strong>{p.title}</strong>
          <p>{p.message}</p>
          {p.solutions.length > 0 ? (
            <ul>
              {p.solutions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-verify-unknown">
              Causa não identificada automaticamente — siga apenas as orientações seguras abaixo.
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

export function DashboardVerifyModal(props: DashboardVerifyModalProps) {
  const {
    item,
    verifying,
    metricsReady,
    lastUpdatedAt,
    operational,
    installedInventory,
    databaseSummary,
    cpu,
    memory,
    onlineUsers,
    installedSystems,
    bootstrapStatus,
    bootstrapError,
    bootstrapJob,
    bootstrapLogTail,
    bootstrapInstallBusy,
    bootstrapPrepared,
    onClose,
    onRepeatVerify,
    onOpenSystems,
    onOpenServer,
    onBootstrapRefresh,
    onBootstrapPrepare,
  } = props

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tone = operationalHealthTone(operational.level)
  const operationalDetail =
    item.id.startsWith('operational-') && item.id !== 'operational-global'
      ? operational.details.find((d) => `operational-${d.id}` === item.id)
      : undefined

  const systemRow =
    item.id.startsWith('system-') ? installedSystems.find((r) => `system-${r.systemId}` === item.id) : undefined

  let leftTitle = 'Verificações'
  let leftContent: ReactNode = null
  let problems: { title: string; message: string; solutions: string[] }[] = []
  let actions: ReactNode = null
  let verifiedAt = lastUpdatedAt

  if (item.id === 'operational-global') {
    leftContent = (
      <>
        <p className="dashboard-verify-lead">{operational.summary}</p>
        <DetailChecks details={operational.details} />
        <p className="dashboard-verify-meta">
          Referência:{' '}
          {OPERATIONAL_HEALTH_DEFINITIONS.find((d) => d.level === operational.level)?.description ??
            operational.label}
        </p>
      </>
    )
    problems = operational.details
      .filter((d) => d.status === 'warn' || d.status === 'fail')
      .map((d) => ({
        title: d.label,
        message: d.message,
        solutions: d.solutions ?? [],
      }))
    actions = (
      <>
        <button type="button" className="button button-secondary button-small" onClick={() => onOpenSystems()}>
          Meus Sistemas
        </button>
        <button type="button" className="button button-secondary button-small" onClick={() => onOpenServer()}>
          Servidor
        </button>
      </>
    )
  } else if (item.id === 'local-service') {
    leftContent = (
      <>
        <p className="dashboard-verify-lead">
          API HTTP do Manager em <strong>127.0.0.1:47831</strong> — utilizada pela interface em :5199.
        </p>
        <p className="dashboard-verify-meta">
          {metricsReady
            ? 'Resposta recebida neste ciclo (métricas e visão operacional).'
            : 'Aguardando primeira resposta do serviço local.'}
        </p>
      </>
    )
    if (!metricsReady) {
      problems = [
        {
          title: 'Serviço local',
          message: 'Ainda não foi possível confirmar o serviço neste ciclo.',
          solutions: ['Feche e reabra o Manager pelo atalho.', 'Aguarde alguns segundos e repita a verificação.'],
        },
      ]
    }
  } else if (operationalDetail) {
    leftContent = (
      <>
        <p className="dashboard-verify-lead">{operationalDetail.message}</p>
        <p className="dashboard-verify-meta">
          Estado: {operationalComponentStatusLabel(operationalDetail.status)}
        </p>
      </>
    )
    if (operationalDetail.status === 'warn' || operationalDetail.status === 'fail') {
      problems = [
        {
          title: operationalDetail.label,
          message: operationalDetail.message,
          solutions: operationalDetail.solutions ?? [],
        },
      ]
    }
  } else if (item.id === 'metric-installed') {
    const display = buildDashboardInstalledSystemsDisplay(installedInventory, databaseSummary)
    leftContent = (
      <>
        <p className="dashboard-verify-lead">
          Total confirmado em disco: <strong>{display.value}</strong>
        </p>
        <p className="dashboard-verify-meta">{display.detail}</p>
      </>
    )
    if (installedInventory.confirmed && installedInventory.summary.error > 0) {
      problems = [
        {
          title: 'Sistemas com erro',
          message: `${installedInventory.summary.error} instalação(ões) reportam erro de runtime.`,
          solutions: ['Abra Meus Sistemas, selecione cada sistema e use Atualizar status / Reiniciar.'],
        },
      ]
    }
    actions = (
      <button type="button" className="button button-secondary button-small" onClick={() => onOpenSystems()}>
        Meus Sistemas
      </button>
    )
  } else if (item.id === 'metric-running') {
    leftContent = (
      <p className="dashboard-verify-lead">
        {installedInventory.confirmed
          ? `${installedInventory.summary.running} de ${installedInventory.summary.installed} disponíveis para utilizadores (execução activa). ${installedInventory.summary.stopped} parado(s).`
          : installedInventory.message}
      </p>
    )
    if (installedInventory.confirmed && installedInventory.summary.running === 0 && installedInventory.summary.installed > 0) {
      problems = [
        {
          title: 'Nenhum sistema em execução',
          message: 'Há sistemas instalados, mas nenhum está activo neste momento.',
          solutions: ['Em Meus Sistemas, seleccione a instalação e use Iniciar ou Reiniciar.'],
        },
      ]
    }
  } else if (item.id === 'metric-cpu') {
    leftContent = (
      <>
        <p className="dashboard-verify-lead">
          Utilização: <strong>{cpu.displayValue}</strong> ({cpu.usagePercent}%)
        </p>
        <p className="dashboard-verify-meta">{cpu.detail}</p>
      </>
    )
    if (cpu.detail.toLowerCase().includes('demonstrativo')) {
      problems = [
        {
          title: 'Coleta real pendente',
          message: 'A métrica ainda não foi confirmada pelo serviço local.',
          solutions: [
            'Feche e reabra o Manager pelo atalho.',
            'Confirme que o serviço em 127.0.0.1:47831 responde.',
          ],
        },
      ]
    }
  } else if (item.id === 'metric-memory') {
    leftContent = (
      <>
        <p className="dashboard-verify-lead">
          Utilização: <strong>{memory.usagePercent}%</strong>
        </p>
        <p className="dashboard-verify-meta">{memory.detail}</p>
      </>
    )
    if (memory.detail.toLowerCase().includes('demonstrativo')) {
      problems = [
        {
          title: 'Coleta real pendente',
          message: 'A métrica ainda não foi confirmada pelo serviço local.',
          solutions: ['Reabra o Manager e aguarde a próxima coleta automática.'],
        },
      ]
    }
  } else if (item.id === 'online-users') {
    verifiedAt = onlineUsers.collectedAt || lastUpdatedAt
    leftContent = (
      <>
        <p className="dashboard-verify-lead">{onlineUsers.detail}</p>
        {onlineUsers.perSystem.length > 0 ? (
          <ul className="dashboard-verify-compact-grid">
            {onlineUsers.perSystem.map((row) => (
              <li key={row.systemId}>
                {row.systemId.slice(0, 8)}… · BNC {row.databaseNumber ?? '—'} ·{' '}
                {row.count != null ? row.count : '?'}
              </li>
            ))}
          </ul>
        ) : null}
        {onlineUsers.users.length > 0 ? (
          <ul className="dashboard-verify-users">
            {onlineUsers.users.slice(0, 8).map((u) => (
              <li key={`${u.systemId}-${u.userId}`}>
                {u.displayName ?? u.email ?? u.userId.slice(0, 8)} · {u.systemLabel ?? u.systemId.slice(0, 8)}
              </li>
            ))}
            {onlineUsers.users.length > 8 ? (
              <li className="dashboard-verify-more">+ {onlineUsers.users.length - 8} utilizador(es)</li>
            ) : null}
          </ul>
        ) : null}
      </>
    )
  } else if (item.id === 'bootstrap-deps') {
    verifiedAt = bootstrapStatus ? lastUpdatedAt : lastUpdatedAt
    leftContent = bootstrapStatus ? (
      <>
        <p className="dashboard-verify-lead">{bootstrapStatus.summary}</p>
        <ul className="dashboard-verify-checks">
          {bootstrapStatus.dependencies.map((dep) => (
            <li key={dep.id}>
              <span className="dashboard-verify-check-label">
                {dep.label}
                {dep.critical ? '' : ' (opc.)'}
              </span>
              <span className="dashboard-verify-check-status">{dependencyStateLabel(dep.state)}</span>
              <span className="dashboard-verify-check-msg">{dep.detail}</span>
            </li>
          ))}
        </ul>
      </>
    ) : (
      <p className="dashboard-verify-lead">{bootstrapError ?? 'Aguardando resposta do serviço local.'}</p>
    )
    if (bootstrapStatus) {
      problems = bootstrapStatus.dependencies
        .filter((d) => d.state !== 'ok' && d.state !== 'not_applicable')
        .map((d) => ({
          title: d.label,
          message: d.detail,
          solutions: d.critical
            ? ['Corrija esta dependência antes de instalar sistemas manifest.', 'Execute o Manager como Administrador se indicado.']
            : ['Opcional — pode instalar após corrigir itens críticos.'],
        }))
    }
    if (bootstrapError) {
      problems = [{ title: 'Consulta falhou', message: bootstrapError, solutions: ['Repita Verificar após reabrir o Manager.'] }]
    }
    actions = (
      <button type="button" className="button button-secondary button-small" onClick={() => onBootstrapRefresh()}>
        Atualizar pré-requisitos
      </button>
    )
  } else if (item.id === 'bootstrap-prepare') {
    leftContent = (
      <>
        <p className="dashboard-verify-lead">
          {bootstrapPrepared
            ? 'Computador preparado para perfil supabase-local-v1.'
            : 'Preparação automática disponível — nada instala sem sua acção.'}
        </p>
        {bootstrapStatus ? (
          <ul className="dashboard-verify-compact-grid">
            <li>Pronto manifest: {bootstrapStatus.readyForManifestInstall ? 'Sim' : 'Não'}</li>
            <li>Docker: {bootstrapStatus.docker.running ? 'Em execução' : bootstrapStatus.docker.installed ? 'Parado' : 'Não instalado'}</li>
            <li>Admin: {bootstrapStatus.isAdmin ? 'Sim' : 'Não (UAC)'}</li>
          </ul>
        ) : null}
        {bootstrapJob ? (
          <p className="dashboard-verify-meta">
            Job {bootstrapJob.jobId.slice(0, 8)}… — {bootstrapJob.phase}
            {bootstrapJob.message ? `: ${bootstrapJob.message}` : ''}
          </p>
        ) : null}
        {bootstrapLogTail ? (
          <pre className="dashboard-verify-log">{truncateLogTail(bootstrapLogTail)}</pre>
        ) : null}
      </>
    )
    if (!bootstrapPrepared && bootstrapStatus && !bootstrapStatus.readyForManifestInstall) {
      problems = [
        {
          title: 'Preparação incompleta',
          message: bootstrapStatus.summary || 'Revise pré-requisitos antes de preparar.',
          solutions: ['Use Preparar este computador ou corrija dependências críticas.'],
        },
      ]
    }
    actions = (
      <button
        type="button"
        className="button button-primary button-small"
        disabled={bootstrapInstallBusy || bootstrapStatus?.bootstrapScriptAvailable === false}
        onClick={() => onBootstrapPrepare()}
      >
        {bootstrapInstallBusy ? 'Preparando…' : bootstrapPrepared ? 'Preparar novamente' : 'Preparar este computador'}
      </button>
    )
  } else if (systemRow) {
    leftContent = (
      <ul className="dashboard-verify-compact-grid">
        <li>ID: {systemRow.systemId}</li>
        <li>Estado: {systemRow.stateLabel}</li>
        <li>BNC: {systemRow.databaseNumber ?? '—'}</li>
        <li>Login: {systemRow.loginUrl ?? '—'}</li>
        {systemRow.lastError ? <li>Erro: {systemRow.lastError}</li> : null}
      </ul>
    )
    if (systemRow.state === 'erro') {
      problems = [
        {
          title: systemRow.label,
          message: systemRow.lastError ?? 'Runtime em erro — causa não detalhada neste ciclo.',
          solutions: [
            'Abra Meus Sistemas, seleccione esta instalação e use Atualizar status / Reiniciar.',
            'Consulte logs em C:\\ServidorManager\\systems\\…\\logs.',
          ],
        },
      ]
    }
    actions = (
      <>
        <button type="button" className="button button-secondary button-small" onClick={() => onOpenSystems()}>
          Sistemas
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => onOpenServer(systemRow.systemId)}
        >
          Servidor
        </button>
        {systemRow.loginUrl ? (
          <a href={systemRow.loginUrl} target="_blank" rel="noreferrer" className="button button-secondary button-small">
            Abrir login
          </a>
        ) : null}
      </>
    )
  }

  const allOk = problems.length === 0 && item.tone === 'success'

  return (
    <div className="modal-backdrop dashboard-verify-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal modal-wide dashboard-verify-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-verify-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dashboard-verify-header">
          <div>
            <h2 id="dashboard-verify-title">{item.name}</h2>
            <p className={`dashboard-verify-status-line dashboard-unified-tone-${item.tone}`}>
              <span className="dashboard-unified-status-dot" aria-hidden />
              {item.statusLabel}
              {item.id === 'operational-global' ? (
                <span className={`dashboard-operational-tone-${tone}`}> · {operational.label}</span>
              ) : null}
            </p>
          </div>
          <button type="button" className="button button-secondary button-small" onClick={onClose}>
            Fechar
          </button>
        </header>

        <div className="dashboard-verify-body">
          <section className="dashboard-verify-col" aria-label="Resultados">
            <h3 className="dashboard-verify-col-title">{leftTitle}</h3>
            {leftContent}
          </section>
          <section className="dashboard-verify-col" aria-label="Problemas e acções">
            <h3 className="dashboard-verify-col-title">{allOk ? 'Situação' : 'Problemas e soluções'}</h3>
            <ProblemsColumn
              problems={problems}
              emptyMessage="Tudo operacional neste item — nenhum alerta adicional neste ciclo."
            />
            <div className="dashboard-verify-actions modal-actions">{actions}</div>
          </section>
        </div>

        <footer className="dashboard-verify-footer">
          <span>Última verificação: {formatWhen(verifiedAt)}</span>
          <button
            type="button"
            className="button button-secondary button-small"
            disabled={verifying}
            onClick={() => onRepeatVerify()}
          >
            {verifying ? 'Verificando…' : 'Repetir verificação'}
          </button>
        </footer>
      </div>
    </div>
  )
}
