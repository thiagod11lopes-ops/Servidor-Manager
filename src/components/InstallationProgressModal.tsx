import { useEffect, useId } from 'react'
import type { InstallationUiState } from '../hooks/useSystemInstallation.ts'
import type { InstallationProgressSnapshot } from '../types/installationProgress.ts'
import { InstallationProgressContent } from './InstallationProgressContent.tsx'

type InstallationProgressModalProps = {
  open: boolean
  systemName: string
  installState: InstallationUiState
  progress: InstallationProgressSnapshot | null
  /** Oculta o modal sem cancelar a instalação em andamento. */
  onDismiss: () => void
}

export function InstallationProgressModal({
  open,
  systemName,
  installState,
  progress,
  onDismiss,
}: InstallationProgressModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onDismiss])

  if (!open) return null

  const isLoading = installState.phase === 'loading' || installState.phase === 'awaiting_docker'

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div
        className="modal modal-wide install-progress-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Instalação — {systemName}</h2>

        <InstallationProgressContent
          systemName={systemName}
          installState={installState}
          progress={progress}
          compact
        />

        <div className="modal-actions">
          {isLoading ? (
            <button type="button" className="button button-secondary" onClick={onDismiss}>
              Continuar em segundo plano
            </button>
          ) : (
            <button type="button" className="button button-primary" onClick={onDismiss}>
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
