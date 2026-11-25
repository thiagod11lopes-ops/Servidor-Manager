import { operationalHealthTone } from '../../utils/operationalHealthCatalog.ts'
import type { DashboardOperationalStatus } from '../../types/monitoring.ts'
import type { OmpsContractAccessUiState } from '../../utils/ompsContractAccessUi.ts'
import { DashboardControlHeaderLanAccess } from './DashboardControlHeaderLanAccess.tsx'

type DashboardControlHeaderProps = {
  operational: DashboardOperationalStatus
  lastUpdatedAt: string | null
  isRefreshing: boolean
  onRefresh: () => void
  onOpenSystems: () => void
  showSystemsNav?: boolean
  onOpenServer: () => void
  onOpenPrepare: () => void
  /** Exibido abaixo dos botões de ação (produto Servidor OMPS empacotado). */
  lanAccess?: OmpsContractAccessUiState
  onLanAccessAnalyze?: () => void
  onLanAccessPause?: () => void
  onLanAccessRestart?: () => void
  lanAccessControlBusy?: 'pause' | 'restart' | null
}

function formatLastUpdated(iso: string | null): string {
  if (!iso) return 'Ainda não atualizado'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    })
  } catch {
    return iso
  }
}

export function DashboardControlHeader({
  operational,
  lastUpdatedAt,
  isRefreshing,
  onRefresh,
  onOpenSystems,
  showSystemsNav = true,
  onOpenServer,
  onOpenPrepare,
  lanAccess,
  onLanAccessAnalyze,
  onLanAccessPause,
  onLanAccessRestart,
  lanAccessControlBusy = null,
}: DashboardControlHeaderProps) {
  const tone = operationalHealthTone(operational.level)

  return (
    <header
      className={`dashboard-control-header${lanAccess ? ' dashboard-control-header-with-lan' : ''}`}
      aria-label="Controle do dashboard"
    >
      <div className="dashboard-control-header-main">
        <p className="dashboard-control-health">
          <span className={`dashboard-control-health-pill dashboard-operational-tone-${tone}`}>
            <span className="status-dot" aria-hidden />
            {operational.label}
          </span>
          <span className="dashboard-control-health-summary">{operational.summary}</span>
        </p>
        <p className="dashboard-control-meta">
          Última atualização: <time dateTime={lastUpdatedAt ?? undefined}>{formatLastUpdated(lastUpdatedAt)}</time>
        </p>
      </div>
      <div className="dashboard-control-actions">
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={isRefreshing}
          onClick={() => void onRefresh()}
        >
          {isRefreshing ? 'Atualizando…' : 'Atualizar'}
        </button>
        {showSystemsNav ? (
          <button type="button" className="button button-secondary button-small" onClick={onOpenSystems}>
            Sistemas
          </button>
        ) : null}
        <button type="button" className="button button-secondary button-small" onClick={onOpenServer}>
          Servidor
        </button>
        <button type="button" className="button button-secondary button-small" onClick={onOpenPrepare}>
          Preparar PC
        </button>
      </div>

      {lanAccess ? (
        <DashboardControlHeaderLanAccess
          state={lanAccess}
          onAnalyze={onLanAccessAnalyze}
          onPause={onLanAccessPause}
          onRestart={onLanAccessRestart}
          controlBusy={lanAccessControlBusy}
        />
      ) : null}
    </header>
  )
}
