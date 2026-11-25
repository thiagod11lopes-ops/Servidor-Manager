import { useEffect, useId } from 'react'

export type DockerAnalyzeModalMode = 'preparing' | 'missing' | 'failed'

type DockerAnalyzeModalProps = {
  open: boolean
  mode: DockerAnalyzeModalMode
  progressMessage: string
  errorMessage?: string | null
  busy?: boolean
  onClose: () => void
  onRetry?: () => void
  onOpenBootstrap?: () => void
}

export function DockerAnalyzeModal({
  open,
  mode,
  progressMessage,
  errorMessage,
  busy = false,
  onClose,
  onRetry,
  onOpenBootstrap,
}: DockerAnalyzeModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open || mode === 'preparing') return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, mode, onClose, busy])

  if (!open) return null

  if (mode === 'preparing') {
    return (
      <div className="modal-backdrop">
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy="true">
          <h2 id={titleId}>Preparando Docker</h2>
          <p className="modal-description">
            Este sistema usa Supabase local (containers Docker). O Manager está verificando o Docker Desktop e aguardando
            o Engine responder.
          </p>
          <p className="modal-note">{progressMessage}</p>
          <p className="modal-note">Não feche esta janela — a análise continuará automaticamente quando o Engine estiver pronto.</p>
        </div>
      </div>
    )
  }

  if (mode === 'missing') {
    return (
      <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id={titleId}>Docker Desktop necessário</h2>
          <p className="modal-description">
            A análise deste sistema depende do Docker Desktop (Supabase local). Não foi possível encontrá-lo instalado.
          </p>
          {errorMessage ? <p className="field-error">{errorMessage}</p> : null}
          <div className="modal-actions">
            <button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>
              Fechar
            </button>
            {onOpenBootstrap ? (
              <button type="button" className="button button-primary" disabled={busy} onClick={onOpenBootstrap}>
                Ver pré-requisitos no Dashboard
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Docker não ficou pronto</h2>
        <p className="modal-description">
          O Docker Desktop não respondeu a tempo ou não pôde ser iniciado. A análise foi interrompida para evitar um
          resultado incompleto.
        </p>
        {errorMessage ? <p className="field-error">{errorMessage}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>
            Fechar
          </button>
          {onOpenBootstrap ? (
            <button type="button" className="button button-secondary" disabled={busy} onClick={onOpenBootstrap}>
              Diagnóstico no Dashboard
            </button>
          ) : null}
          {onRetry ? (
            <button type="button" className="button button-primary" disabled={busy} onClick={onRetry}>
              Tentar novamente
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
