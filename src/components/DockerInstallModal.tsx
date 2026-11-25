import { useEffect, useId } from 'react'

export const DOCKER_INSTALL_MODAL_MESSAGE = 'DOCKER NECESSÁRIO, INICIE DOCKER PARA CONTINUAR'

type DockerInstallModalProps = {
  open: boolean
  busy?: boolean
  statusDetail?: string
  onOpenDocker: () => void
  onVerifyAgain: () => void
}

export function DockerInstallModal({
  open,
  busy = false,
  statusDetail,
  onOpenDocker,
  onVerifyAgain,
}: DockerInstallModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open || busy) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy])

  if (!open) return null

  return (
    <div className="modal-backdrop modal-backdrop-blocking">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{DOCKER_INSTALL_MODAL_MESSAGE}</h2>
        {statusDetail ? <p className="modal-note">{statusDetail}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={onOpenDocker}>
            Abrir Docker
          </button>
          <button type="button" className="button button-primary" disabled={busy} onClick={onVerifyAgain}>
            Verificar novamente
          </button>
        </div>
      </div>
    </div>
  )
}
