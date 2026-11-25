import { useEffect, useId, useState } from 'react'
import type { SystemAccessMode } from '../types/systemAccessMode.ts'

type SystemAccessModeCardsProps = {
  selected: SystemAccessMode | null
  onSelect: (mode: SystemAccessMode) => void
  localExample?: string
  lanExample?: string
  localBadge?: string | null
  localTitle?: string
  lanTitle?: string
  localDescription?: string
  lanDescription?: string
  showExamples?: boolean
  showSelectedMark?: boolean
  className?: string
}

export function SystemAccessModeCards({
  selected,
  onSelect,
  localExample = 'http://127.0.0.1:<porta>/login',
  lanExample = 'http://<IPv4-LAN>:<porta>/login',
  localBadge = 'Neste computador',
  localTitle = 'Local',
  lanTitle = 'Rede local (LAN)',
  localDescription = 'Utilize o OMPS no próprio computador servidor (localhost). Não depende de VPN nem de internet externa quando Docker e Caddy já estão prontos.',
  lanDescription =
    'Outros computadores e telemóveis na mesma Wi‑Fi ou cabo Ethernet acedem pelo IPv4 da LAN e proxy Caddy (porta HTTP definida no manifesto). Requer firewall LAN conforme o manifesto.',
  showExamples = true,
  showSelectedMark = false,
  className,
}: SystemAccessModeCardsProps) {
  const cardsClass = className ? `access-mode-cards ${className}` : 'access-mode-cards'

  return (
    <div className={cardsClass} role="radiogroup" aria-label="Modo de acesso">
      <button
        type="button"
        className={`access-mode-card access-mode-card-recommended${selected === 'local' ? ' access-mode-card-selected' : ''}`}
        aria-pressed={selected === 'local'}
        onClick={() => onSelect('local')}
      >
        {showSelectedMark && selected === 'local' ? (
          <span className="access-mode-card-check" aria-hidden="true">
            ✓
          </span>
        ) : null}
        {localBadge ? <span className="access-mode-card-badge">{localBadge}</span> : null}
        <span className="access-mode-card-title">{localTitle}</span>
        <p className="access-mode-card-text">{localDescription}</p>
        {showExamples ? (
          <p className="access-mode-card-example">
            Ex.: <code>{localExample}</code>
          </p>
        ) : null}
      </button>

      <button
        type="button"
        className={`access-mode-card${selected === 'lan' ? ' access-mode-card-selected' : ''}`}
        aria-pressed={selected === 'lan'}
        onClick={() => onSelect('lan')}
      >
        {showSelectedMark && selected === 'lan' ? (
          <span className="access-mode-card-check" aria-hidden="true">
            ✓
          </span>
        ) : null}
        <span className="access-mode-card-title">{lanTitle}</span>
        <p className="access-mode-card-text">{lanDescription}</p>
        {showExamples ? (
          <p className="access-mode-card-example">
            Ex.: <code>{lanExample}</code>
          </p>
        ) : null}
      </button>
    </div>
  )
}

type ChooseSystemAccessModeModalProps = {
  open: boolean
  systemName: string
  onClose: () => void
  onConfirm: (mode: SystemAccessMode) => void
}

export function ChooseSystemAccessModeModal({
  open,
  systemName,
  onClose,
  onConfirm,
}: ChooseSystemAccessModeModalProps) {
  const titleId = useId()
  const [selected, setSelected] = useState<SystemAccessMode | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Como aceder ao sistema?</h2>
        <p className="modal-description">
          Antes de instalar <strong>{systemName}</strong>, escolha como utilizadores vão abrir a
          aplicação. Pode alterar depois (sem reinstalar ficheiros do projeto).
        </p>

        <SystemAccessModeCards selected={selected} onSelect={setSelected} />

        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={selected === null}
            onClick={() => {
              if (selected) onConfirm(selected)
            }}
          >
            Continuar instalação
          </button>
        </div>
      </div>
    </div>
  )
}
