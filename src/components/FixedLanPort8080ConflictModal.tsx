import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { localManagerService } from '../services/index.ts'
import type {
  FixedLanPort8080ConflictSnapshot,
  FixedLanPort8080ReleaseAuthorization,
} from '../types/fixedLanPort8080.ts'

type FixedLanPort8080ConflictModalProps = {
  open: boolean
  systemId: string
  busy?: boolean
  onClose: () => void
  onReleased: () => void
}

export function FixedLanPort8080ConflictModal({
  open,
  systemId,
  busy: externalBusy = false,
  onClose,
  onReleased,
}: FixedLanPort8080ConflictModalProps) {
  const titleId = useId()
  const [loading, setLoading] = useState(false)
  const [conflict, setConflict] = useState<FixedLanPort8080ConflictSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [releaseBusy, setReleaseBusy] = useState(false)

  const busy = externalBusy || loading || releaseBusy
  const authorization: FixedLanPort8080ReleaseAuthorization | null =
    conflict?.releaseAuthorization ?? null

  useEffect(() => {
    if (!open) {
      setConflict(null)
      setError(null)
      setConfirmRelease(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void localManagerService.getFixedLanPort8080Conflict(systemId).then((response) => {
      if (cancelled) return
      setLoading(false)
      if (!response.ok) {
        setError(response.message)
        return
      }
      setConflict(response.conflict)
    })
    return () => {
      cancelled = true
    }
  }, [open, systemId])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, busy])

  if (!open) return null

  const listener = conflict?.primaryListener ?? authorization?.listener ?? null

  async function handleRelease() {
    if (!authorization || !listener?.pid || !listener.processName) return
    setReleaseBusy(true)
    setError(null)
    try {
      const result = await localManagerService.releaseAuthorizedFixedLanPort8080(systemId, {
        actionToken: authorization.actionToken,
        confirm: true,
        listener: {
          pid: listener.pid,
          processName: listener.processName,
          executablePath: listener.executablePath,
        },
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      onReleased()
    } finally {
      setReleaseBusy(false)
    }
  }

  return createPortal(
    <div className="modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        className="modal-card omps-port8080-conflict-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <h2 id={titleId}>Porta TCP 8080 em uso</h2>
          <p className="modal-lead">
            O Servidor OMPS exige a porta <strong>8080</strong> (sem fallback). Identifique o processo abaixo antes de
            continuar.
          </p>
        </header>

        {loading ? <p className="omps-setup-message">Consultando processos na porta 8080…</p> : null}

        {error ? (
          <div className="omps-setup-alert omps-setup-alert-error" role="alert">
            {error}
          </div>
        ) : null}

        {listener ? (
          <dl className="omps-duplicate-install-details">
            <div>
              <dt>Endereço local</dt>
              <dd>{listener.localAddress ?? '—'}:{listener.port}</dd>
            </div>
            <div>
              <dt>Processo</dt>
              <dd>{listener.processName ?? 'desconhecido'}</dd>
            </div>
            <div>
              <dt>PID</dt>
              <dd>{listener.pid ?? '—'}</dd>
            </div>
            {listener.executablePath ? (
              <div>
                <dt>Executável</dt>
                <dd className="omps-duplicate-install-mono">{listener.executablePath}</dd>
              </div>
            ) : null}
            {listener.serviceName ? (
              <div>
                <dt>Serviço Windows</dt>
                <dd>{listener.serviceName}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {authorization ? (
          <label className="omps-duplicate-install-confirm">
            <input
              type="checkbox"
              checked={confirmRelease}
              disabled={busy}
              onChange={(e) => setConfirmRelease(e.target.checked)}
            />
            <span>
              Autorizo encerrar <strong>{authorization.listener.processName ?? 'o processo'}</strong> (PID{' '}
              {authorization.listener.pid ?? '?'}) para liberar a porta 8080. {authorization.impactSummary}
            </span>
          </label>
        ) : (
          <ul className="omps-port8080-manual-steps">
            {(conflict?.manualSteps ?? []).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        )}

        <footer className="modal-footer">
          <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          {authorization ? (
            <button
              type="button"
              className="btn primary"
              disabled={busy || !confirmRelease}
              onClick={() => void handleRelease()}
            >
              Encerrar processo identificado e liberar 8080
            </button>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
