import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { OmpsContractAccessUiState } from '../../utils/ompsContractAccessUi.ts'
import {
  collectOmpsLanAccessProblems,
  ompsLanAccessHealthLabel,
  resolveDashboardLanAccessView,
  resolveOmpsLanAccessHealth,
  resolveOmpsLanAccessPanelTitle,
  resolveOmpsLanAccessPlainSummary,
  shouldShowOmpsAnalyzeProgressBar,
} from '../../utils/ompsContractAccessUi.ts'
import { OmpsContractAccessAnalyzeProgress } from './OmpsContractAccessAnalyzeProgress.tsx'

type DashboardControlHeaderLanAccessProps = {
  state: OmpsContractAccessUiState
  onAnalyze?: () => void
  onPause?: () => void
  onRestart?: () => void
  controlBusy?: 'pause' | 'restart' | null
}

export function DashboardControlHeaderLanAccess({
  state,
  onAnalyze,
  onPause,
  onRestart,
  controlBusy = null,
}: DashboardControlHeaderLanAccessProps) {
  const view = resolveDashboardLanAccessView(state)
  const health = resolveOmpsLanAccessHealth(state)
  const panelTitle = resolveOmpsLanAccessPanelTitle(state)
  const problems = collectOmpsLanAccessProblems(state)
  const plain = resolveOmpsLanAccessPlainSummary(state)
  const showAnalyzeProgress = shouldShowOmpsAnalyzeProgressBar(state)
  const installActive =
    state.analyzing ||
    state.embeddedInstallProgress?.status === 'running' ||
    state.embeddedInstallProgress?.status === 'awaiting_docker'
  const actionsDisabled = state.analyzing || controlBusy != null
  // Durante a análise só Pausar/Reiniciar; Analizar fica bloqueado até terminar.
  const detailsId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const copyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopyHint('Copiado')
      window.setTimeout(() => setCopyHint(null), 2000)
    } catch {
      setCopyHint('Falha ao copiar')
    }
  }, [])

  useEffect(() => {
    if (state.analyzing) setDetailsOpen(true)
  }, [state.analyzing])

  useEffect(() => {
    if (!detailsOpen || state.analyzing) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDetailsOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [detailsOpen, state.analyzing])

  return (
    <div
      ref={rootRef}
      className="dashboard-control-lan-access"
      aria-label="Endereço local do Usuário OMPS"
    >
      <span className="dashboard-control-lan-access-label">
        Endereço local
        <span className="dashboard-control-lan-access-sublabel"> · Usuário OMPS</span>
      </span>

      <div className="dashboard-control-lan-access-url-row">
        {view.displayUrl ? (
          <>
            <a
              href={view.displayUrl}
              className="dashboard-control-lan-access-url"
              target="_blank"
              rel="noreferrer"
              title={view.displayUrl}
            >
              {view.displayUrl}
            </a>
            <button
              type="button"
              className="button button-secondary button-small dashboard-control-lan-access-copy"
              aria-label="Copiar URL de acesso na LAN"
              onClick={() => void copyUrl(view.displayUrl!)}
            >
              {copyHint ?? 'Copiar'}
            </button>
          </>
        ) : (
          <span className="dashboard-control-lan-access-url-missing">Endereço ainda não determinado</span>
        )}

        <button
          type="button"
          className={`dashboard-control-lan-access-health dashboard-control-lan-access-health-${health}`}
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          aria-label={`Status do endereço: ${ompsLanAccessHealthLabel(health)}. Mostrar detalhes.`}
          title={
            state.analyzing
              ? `${ompsLanAccessHealthLabel(health)} (análise em andamento)`
              : ompsLanAccessHealthLabel(health)
          }
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <span className="dashboard-control-lan-access-health-dot" aria-hidden />
          <span className="dashboard-control-lan-access-health-text">Status</span>
        </button>
      </div>

      {detailsOpen ? (
        <div
          id={detailsId}
          className="dashboard-control-lan-access-details"
          role="region"
          aria-label="Detalhes do status do endereço local"
        >
          <p className="dashboard-control-lan-access-plain-headline">{plain.headline}</p>
          <p className="dashboard-control-lan-access-plain-hint">{plain.hint}</p>
          <div className="dashboard-control-lan-access-details-head">
            <p className="dashboard-control-lan-access-details-title">{panelTitle}</p>
            <div className="dashboard-control-lan-access-actions">
              {onAnalyze ? (
                <button
                  type="button"
                  className="button button-secondary button-small dashboard-control-lan-access-analyze"
                  disabled={actionsDisabled}
                  onClick={() => onAnalyze()}
                >
                  {state.analyzing && controlBusy == null ? 'Analizando…' : 'Analizar'}
                </button>
              ) : null}
              {onRestart ? (
                <button
                  type="button"
                  className="button button-secondary button-small"
                  disabled={actionsDisabled}
                  title="Reinicia a preparação do motor embutido do zero"
                  onClick={() => onRestart()}
                >
                  {controlBusy === 'restart' ? 'Reiniciando…' : 'Reiniciar'}
                </button>
              ) : null}
              {onPause ? (
                <button
                  type="button"
                  className="button button-secondary button-small"
                  disabled={actionsDisabled || !installActive}
                  title="Pausa a preparação após a fase atual"
                  onClick={() => onPause()}
                >
                  {controlBusy === 'pause' ? 'Pausando…' : 'Pausar'}
                </button>
              ) : null}
            </div>
          </div>
          {showAnalyzeProgress ? (
            <OmpsContractAccessAnalyzeProgress
              analyzing={state.analyzing}
              progress={state.embeddedInstallProgress}
              analyzeStartedAt={state.analyzeStartedAt}
            />
          ) : null}
          <ul className="dashboard-control-lan-access-details-list">
            {problems.map((line, index) => (
              <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
