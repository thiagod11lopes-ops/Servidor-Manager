import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  InstallationDuplicateConflict,
  InstallationDuplicateSummary,
} from '../types/installationDuplicate.ts'
import {
  duplicateInstallBlockedReason,
  getDuplicateInstallModalActions,
} from '../utils/installationDuplicateConflict.ts'

export type BundledOmpsIncompleteDuplicate = {
  message: string
  detail: string
}

type BundledOmpsDuplicateInstallModalProps = {
  open: boolean
  conflict: InstallationDuplicateConflict | null
  incompleteDuplicate?: BundledOmpsIncompleteDuplicate | null
  busy?: boolean
  errorMessage?: string | null
  onClose: () => void
  onResume: (systemId: string) => void
  onReplace: (systemId: string) => void
  onOpenExisting: (systemId: string) => void
}

function formatLastActivity(at: string | null): string | null {
  if (!at) return null
  const parsed = Date.parse(at)
  if (!Number.isFinite(parsed)) return at
  return new Date(parsed).toLocaleString()
}

function SummaryDetails({ existing }: { existing: InstallationDuplicateSummary }) {
  const last = formatLastActivity(existing.lastActivityAt)
  return (
    <dl className="omps-duplicate-install-details">
      <div>
        <dt>Sistema</dt>
        <dd>{existing.systemName}</dd>
      </div>
      <div>
        <dt>Repositório / origem</dt>
        <dd className="omps-duplicate-install-mono">{existing.repositoryLabel}</dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>{existing.lifecycleLabel}</dd>
      </div>
      {last ? (
        <div>
          <dt>Última atividade</dt>
          <dd>{last}</dd>
        </div>
      ) : null}
      <div>
        <dt>Identificador</dt>
        <dd className="omps-duplicate-install-mono">{existing.systemId}</dd>
      </div>
    </dl>
  )
}

export function BundledOmpsDuplicateInstallModal({
  open,
  conflict,
  incompleteDuplicate = null,
  busy = false,
  errorMessage = null,
  onClose,
  onResume,
  onReplace,
  onOpenExisting,
}: BundledOmpsDuplicateInstallModalProps) {
  const titleId = useId()
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setConfirmReplace(false)
      setSelectedSystemId(null)
    }
  }, [open])

  useEffect(() => {
    if (conflict) setSelectedSystemId(conflict.existing.systemId)
  }, [conflict])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, busy])

  if (!open) return null
  if (!conflict && !incompleteDuplicate) return null

  const incomplete = conflict == null && incompleteDuplicate != null
  const displayMessage = conflict?.message ?? incompleteDuplicate!.message
  const actions =
    conflict && selectedSystemId
      ? getDuplicateInstallModalActions(conflict, selectedSystemId)
      : conflict
        ? getDuplicateInstallModalActions(conflict)
        : null
  const selectedSummary =
    conflict && selectedSystemId
      ? (conflict.candidates?.find((item) => item.systemId === selectedSystemId) ?? conflict.existing)
      : conflict?.existing ?? null
  const blockedReason = incomplete
    ? incompleteDuplicate!.detail
    : conflict
      ? duplicateInstallBlockedReason(conflict)
      : null
  const options = conflict?.options

  const modal = (
    <div
      className="modal-backdrop modal-backdrop-blocking omps-duplicate-install-backdrop"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="modal modal-wide omps-duplicate-install-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="omps-duplicate-install-modal-body">
          <h2 id={titleId}>Instalação já existente</h2>
          <p className="modal-description">{displayMessage}</p>
          {conflict && conflict.ambiguous && (conflict.candidates?.length ?? 0) > 1 ? (
            <fieldset className="omps-duplicate-install-candidates">
              <legend>Selecione a instalação</legend>
              <ul>
                {(conflict.candidates ?? []).map((candidate) => (
                  <li key={candidate.systemId}>
                    <label className="omps-duplicate-install-candidate">
                      <input
                        type="radio"
                        name="omps-duplicate-candidate"
                        checked={selectedSystemId === candidate.systemId}
                        disabled={busy}
                        onChange={() => setSelectedSystemId(candidate.systemId)}
                      />
                      <span>
                        <strong>{candidate.systemName}</strong> — {candidate.lifecycleLabel}
                        <span className="omps-duplicate-install-mono"> ({candidate.systemId})</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}

          {selectedSummary ? <SummaryDetails existing={selectedSummary} /> : null}

          {blockedReason ? (
            <p className="omps-setup-alert omps-setup-alert-error" role="status">
              {blockedReason}
            </p>
          ) : null}

          {!incomplete && options?.canReplace ? (
            <div className="omps-duplicate-install-replace-scope">
              <p className="modal-note">
                <strong>Excluir e reinstalar</strong> remove somente a pasta gerenciada{' '}
                <code>C:\ServidorManager\systems\{selectedSystemId ?? conflict!.existing.systemId}</code>: para
                processos deste
                sistema,
                serviço Windows associado (se existir) e stack LAN/Supabase vinculada a essa instalação. Não
                executa limpeza global do Docker nem afeta outros sistemas.
              </p>
              <label className="omps-duplicate-install-confirm">
                <input
                  type="checkbox"
                  checked={confirmReplace}
                  disabled={busy}
                  onChange={(event) => setConfirmReplace(event.target.checked)}
                />
                Entendo o escopo e desejo excluir esta instalação antes de reinstalar
              </label>
            </div>
          ) : null}

          {errorMessage ? <p className="field-error">{errorMessage}</p> : null}
        </div>

        <div className="modal-actions omps-duplicate-install-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          {!incomplete && actions?.showOpenExisting ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => onOpenExisting(selectedSystemId ?? conflict!.existing.systemId)}
            >
              Abrir instalação existente
            </button>
          ) : null}
          {!incomplete && actions?.showResume ? (
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => onResume(selectedSystemId ?? conflict!.existing.systemId)}
            >
              {busy ? 'Retomando…' : 'Retomar instalação'}
            </button>
          ) : null}
          {!incomplete && actions?.showReplace ? (
            <button
              type="button"
              className="button button-danger"
              disabled={busy || (actions.replaceRequiresConfirmation && !confirmReplace)}
              onClick={() => onReplace(selectedSystemId ?? conflict!.existing.systemId)}
            >
              {busy ? 'Excluindo…' : 'Excluir e reinstalar'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
