import { useMemo, useState } from 'react'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'
import {
  buildSystemAccessPanelView,
  normalizeRuntimeStatusForUi,
} from '../utils/systemAccessPanelDisplay.ts'
import { scrollToPageSection } from '../utils/scrollToPageSection.ts'

type SystemAccessPanelProps = {
  systemName?: string
  runtimeStatus?: SystemRuntimeStatus | null
  onRefreshRuntime?: () => void
}

export function SystemAccessPanel({
  runtimeStatus,
  onRefreshRuntime,
}: SystemAccessPanelProps) {
  const [copyHint, setCopyHint] = useState<string | undefined>()

  const view = useMemo(() => {
    const normalized = runtimeStatus ? normalizeRuntimeStatusForUi(runtimeStatus) : null
    return buildSystemAccessPanelView({
      accessMode: normalized?.accessMode,
      runtimeStatus: normalized,
    })
  }, [runtimeStatus])

  async function copyShareUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopyHint('Endereço copiado.')
    } catch {
      setCopyHint('Não foi possível copiar.')
    }
  }

  return (
    <section id="system-access-panel" className="analysis-panel system-access-panel">
      <div className="analysis-header">
        <p className="analysis-title">Acesso ao sistema</p>
        <span className={`badge ${view.badgeClass}`}>{view.operationalLabel}</span>
      </div>

      {view.modeLabel ? (
        <p className="modal-note">
          Modo configurado: <strong>{view.modeLabel}</strong>
        </p>
      ) : null}

      {view.shareUrl ? (
        <div className="system-access-share">
          <p className="analysis-meta">{view.shareUrlHint}</p>
          <code className="system-access-url">{view.shareUrl}</code>
          {view.showCopy ? (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => void copyShareUrl(view.shareUrl!)}
            >
              Copiar endereço
            </button>
          ) : null}
          {copyHint ? <p className="modal-note">{copyHint}</p> : null}
        </div>
      ) : null}

      <ul className="plan-steps">
        {view.instructions.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <div className="modal-actions">
        {onRefreshRuntime ? (
          <button type="button" className="button button-secondary button-small" onClick={onRefreshRuntime}>
            Atualizar execução
          </button>
        ) : null}
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => scrollToPageSection('network-access-panel')}
        >
          Ver rede / firewall
        </button>
      </div>
    </section>
  )
}
