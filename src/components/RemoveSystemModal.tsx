import { useEffect, useId } from 'react'
import type { ManagedSystem } from '../types/system.ts'

type RemoveSystemModalProps = {
  open: boolean
  system: ManagedSystem | null
  busy?: boolean
  errorMessage?: string | null
  onClose: () => void
  onConfirm: (systemId: string) => void
}

export function RemoveSystemModal({
  open,
  system,
  busy = false,
  errorMessage = null,
  onClose,
  onConfirm,
}: RemoveSystemModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, busy])

  if (!open || !system) return null

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Desinstalar sistema</h2>
        <p className="modal-description">
          Desinstalar <strong>{system.name}</strong> deste computador?
        </p>
        <p className="modal-note">
          O Manager irá parar processos em execução, remover o serviço Windows (se existir) e apagar a pasta{' '}
          <code>C:\ServidorManager\systems\{system.id}</code>, incluindo banco Supabase local e arquivos do projeto.
          Esta ação não pode ser desfeita.
        </p>
        {errorMessage ? <p className="field-error">{errorMessage}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={busy}
            onClick={() => onConfirm(system.id)}
          >
            {busy ? 'Desinstalando…' : 'Desinstalar'}
          </button>
        </div>
      </div>
    </div>
  )
}
