import { useState } from 'react'
import type { OmpsContractAccessUiState } from '../utils/ompsContractAccessUi.ts'

type OmpsContractAccessPanelProps = {
  state: OmpsContractAccessUiState
  onRefresh?: () => void
  isRefreshing?: boolean
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
  } catch {
    return iso
  }
}

export function OmpsContractAccessPanel({ state, onRefresh, isRefreshing }: OmpsContractAccessPanelProps) {
  const [copyHint, setCopyHint] = useState<string | undefined>()

  async function copyShareUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopyHint('Endereço copiado.')
    } catch {
      setCopyHint('Não foi possível copiar.')
    }
  }

  return (
    <section className="analysis-panel system-access-panel omps-contract-access-panel">
      <div className="analysis-header">
        <p className="analysis-title">Acesso ao sistema</p>
        <span className={`badge ${state.badgeClass}`}>{state.statusLabel}</span>
      </div>

      <div className="system-access-share">
        <p className="analysis-meta">Endereço de acesso (contrato LAN fixo):</p>
        <code className="system-access-url">{state.loginUrl}</code>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => void copyShareUrl(state.loginUrl)}
        >
          Copiar endereço
        </button>
        {copyHint ? <p className="modal-note">{copyHint}</p> : null}
      </div>

      <p className="modal-note">{state.message}</p>

      <p className="analysis-meta">
        Última verificação:{' '}
        <time dateTime={state.lastCheckedAt ?? undefined}>{formatTimestamp(state.lastCheckedAt)}</time>
        {state.lastSuccessAt ? (
          <>
            {' '}
            · Última confirmação de serviço ativo:{' '}
            <time dateTime={state.lastSuccessAt}>{formatTimestamp(state.lastSuccessAt)}</time>
          </>
        ) : null}
      </p>

      {onRefresh ? (
        <div className="modal-actions">
          <button
            type="button"
            className="button button-secondary button-small"
            disabled={isRefreshing || state.phase === 'checking'}
            onClick={() => void onRefresh()}
          >
            {isRefreshing ? 'Verificando…' : 'Verificar agora'}
          </button>
        </div>
      ) : null}
    </section>
  )
}
