import { useState } from 'react'
import type { InstallationUiState } from '../hooks/useSystemInstallation.ts'
import type { InstallationProgressSnapshot } from '../types/installationProgress.ts'
import {
  findCurrentInstallPhase,
  formatInstallElapsed,
  formatInstallEta,
  partitionInstallPhases,
} from '../utils/installationProgressDisplay.ts'

type InstallationProgressContentProps = {
  systemName: string
  installState: InstallationUiState
  progress: InstallationProgressSnapshot | null
  compact?: boolean
}

export function InstallationProgressContent({
  systemName,
  installState,
  progress,
  compact = false,
}: InstallationProgressContentProps) {
  const [showDetails, setShowDetails] = useState(false)

  const isLoading = installState.phase === 'loading' || installState.phase === 'awaiting_docker'
  const isSuccess = installState.phase === 'success'
  const isError = installState.phase === 'error'
  const percent = progress?.percent ?? (isSuccess ? 100 : isLoading ? 0 : 0)
  const currentPhase = progress ? findCurrentInstallPhase(progress) : null
  const { completed, pending, failed } = progress
    ? partitionInstallPhases(progress.phases)
    : { completed: [], pending: [], failed: null }

  const failedPhase =
    failed ??
    (progress?.failedPhaseId
      ? progress.phases.find((phase) => phase.id === progress.failedPhaseId) ?? null
      : null)

  const errorMessage =
    installState.phase === 'error'
      ? installState.error
      : progress?.error ?? failedPhase?.message ?? installState.result?.error

  return (
    <div className={compact ? 'install-progress-content install-progress-content-compact' : 'install-progress-content'}>
      {!compact ? <p className="analysis-title">Instalação — {systemName}</p> : null}

      {isSuccess ? (
        <p className="install-progress-status install-progress-status-ok">
          Instalação concluída com sucesso.
        </p>
      ) : null}

      {isError ? (
        <p className="install-progress-status install-progress-status-error">
          A instalação não foi concluída
          {failedPhase ? (
            <>
              {' '}
              na fase <strong>{failedPhase.label}</strong>
            </>
          ) : null}
          .
        </p>
      ) : null}

      {isLoading && !compact ? (
        <p className="modal-description">
          A instalação continua em segundo plano se você fechar este painel.
        </p>
      ) : null}

      <div className="install-progress-bar" aria-hidden={!progress && !isSuccess}>
        <div
          className="install-progress-bar-fill"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <p className="install-progress-percent" aria-live="polite">
        {percent}%
      </p>

      <div className="install-progress-meta">
        <span>
          Tempo decorrido: <strong>{formatInstallElapsed(progress?.elapsedMs ?? 0)}</strong>
        </span>
        <span>
          Restante: <strong>{progress ? formatInstallEta(progress) : '—'}</strong>
        </span>
      </div>

      {currentPhase && isLoading ? (
        <div className="install-progress-current">
          <p className="analysis-title">Fase atual</p>
          <p className="install-progress-current-label">{currentPhase.label}</p>
          {currentPhase.message ? (
            <p className="analysis-disclaimer">{currentPhase.message}</p>
          ) : currentPhase.description ? (
            <p className="analysis-disclaimer">{currentPhase.description}</p>
          ) : null}
        </div>
      ) : null}

      {progress && progress.phases.length > 0 ? (
        <div className="install-progress-columns">
          <div>
            <p className="analysis-title">Concluídas ({completed.length})</p>
            <ul className="install-progress-list">
              {completed.length === 0 ? (
                <li className="install-progress-list-muted">Nenhuma ainda</li>
              ) : (
                completed.map((phase) => (
                  <li key={phase.id}>
                    <span>{phase.label}</span>
                    {phase.status === 'skipped' ? (
                      <small className="install-progress-tag">ignorada</small>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="analysis-title">Pendentes ({pending.length})</p>
            <ul className="install-progress-list">
              {pending.length === 0 ? (
                <li className="install-progress-list-muted">Nenhuma</li>
              ) : (
                pending.map((phase) => (
                  <li key={phase.id}>
                    <span>{phase.label}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : isLoading ? (
        <p className="analysis-disclaimer">Aguardando o primeiro relatório de fases do servidor…</p>
      ) : null}

      {isError && errorMessage ? (
        <div className="install-progress-error">
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => setShowDetails((value) => !value)}
          >
            {showDetails ? 'Ocultar detalhes' : 'Ver detalhes do erro'}
          </button>
          {showDetails ? <pre className="install-progress-error-detail">{errorMessage}</pre> : null}
        </div>
      ) : null}
    </div>
  )
}
