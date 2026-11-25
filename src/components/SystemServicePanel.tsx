import type { ServiceUiPhase } from '../hooks/useSystemService.ts'
import type { SystemServiceStatus } from '../types/systemService.ts'
import { serviceVisualStateLabel } from '../types/systemService.ts'

type SystemServicePanelProps = {
  busyPhase?: ServiceUiPhase
  error?: string
  message?: string
  status?: SystemServiceStatus
  canManage?: boolean
  onInstall: (automaticStartup: boolean) => void
  onUninstall: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onEnableAuto: () => void
  onDisableAuto: () => void
  onRefresh: () => void
}

function isBusy(phase?: ServiceUiPhase): boolean {
  return (
    phase === 'loading' ||
    phase === 'installing' ||
    phase === 'starting' ||
    phase === 'stopping' ||
    phase === 'restarting' ||
    phase === 'removing'
  )
}

export function SystemServicePanel({
  busyPhase,
  error,
  message,
  status,
  canManage,
  onInstall,
  onUninstall,
  onStart,
  onStop,
  onRestart,
  onEnableAuto,
  onDisableAuto,
  onRefresh,
}: SystemServicePanelProps) {
  if (!canManage && !status) return null

  const busy = isBusy(busyPhase)
  const installed = status?.installed ?? false
  const running = status?.running ?? false

  return (
    <div className={`analysis-panel${error ? ' analysis-panel-error' : ''}`}>
      <div className="analysis-header">
        <h3 className="analysis-title">Serviço do Sistema</h3>
      </div>
      {busy ? (
        <p className="analysis-disclaimer">
          {busyPhase === 'installing'
            ? 'Instalando serviço...'
            : busyPhase === 'starting'
              ? 'Iniciando serviço...'
              : busyPhase === 'stopping'
                ? 'Parando serviço...'
                : busyPhase === 'restarting'
                  ? 'Reiniciando serviço...'
                  : busyPhase === 'removing'
                    ? 'Removendo serviço...'
                    : 'Atualizando serviço...'}
        </p>
      ) : null}
      {error ? <p className="analysis-disclaimer">{error}</p> : null}
      {message && !error ? <p className="analysis-disclaimer">{message}</p> : null}

      <dl className="analysis-grid">
        <div>
          <dt>Serviço</dt>
          <dd>{status?.serviceName ?? '—'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{status ? serviceVisualStateLabel[status.visualState] : '—'}</dd>
        </div>
        <div>
          <dt>Inicialização</dt>
          <dd>{status?.startupMode === 'automatic' ? 'Automática' : 'Manual'}</dd>
        </div>
      </dl>

      {status?.lastError ? <p className="analysis-disclaimer">{status.lastError}</p> : null}

      <div className="system-actions">
        {!installed ? (
          <>
            <button type="button" className="button button-primary button-small" disabled={busy} onClick={() => onInstall(false)}>
              Instalar serviço
            </button>
            <button type="button" className="button button-secondary button-small" disabled={busy} onClick={() => onInstall(true)}>
              Instalar com início automático
            </button>
          </>
        ) : null}
        {installed && !running ? (
          <button type="button" className="button button-primary button-small" disabled={busy} onClick={onStart}>
            Iniciar
          </button>
        ) : null}
        {installed && running ? (
          <>
            <button type="button" className="button button-secondary button-small" disabled={busy} onClick={onStop}>
              Parar
            </button>
            <button type="button" className="button button-secondary button-small" disabled={busy} onClick={onRestart}>
              Reiniciar
            </button>
          </>
        ) : null}
        {installed ? (
          <>
            <button type="button" className="button button-secondary button-small" disabled={busy} onClick={onUninstall}>
              Remover serviço
            </button>
            {status?.startupMode === 'manual' ? (
              <button type="button" className="button button-secondary button-small" disabled={busy} onClick={onEnableAuto}>
                Ativar inicialização automática
              </button>
            ) : (
              <button type="button" className="button button-secondary button-small" disabled={busy} onClick={onDisableAuto}>
                Desativar inicialização automática
              </button>
            )}
          </>
        ) : null}
        <button type="button" className="button button-secondary button-small" disabled={busy} onClick={onRefresh}>
          Atualizar status
        </button>
      </div>
    </div>
  )
}
