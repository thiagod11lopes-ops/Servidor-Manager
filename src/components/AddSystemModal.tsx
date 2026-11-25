import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { SystemAccessModeCards } from './ChooseSystemAccessModeModal.tsx'
import { InstallationPlanPanel } from './InstallationPlanPanel.tsx'
import { InstallationProgressContent } from './InstallationProgressContent.tsx'
import { InstallationResultPanel } from './InstallationResultPanel.tsx'
import { SystemAnalysisPanel } from './SystemAnalysisPanel.tsx'
import { DOCKER_INSTALL_MODAL_MESSAGE } from './DockerInstallModal.tsx'
import type { InstallationPlanUiState } from '../hooks/useInstallationPlan.ts'
import type { InstallationUiState } from '../hooks/useSystemInstallation.ts'
import type { SystemAnalysisUiState } from '../hooks/useSystemAnalysis.ts'
import { pickLocalProjectFolder } from '../platform/pickLocalFolder.ts'
import type { InstallationProgressSnapshot } from '../types/installationProgress.ts'
import type { ManagedSystem, SystemSourceKind } from '../types/system.ts'
import type { SystemAccessMode } from '../types/systemAccessMode.ts'
import { isValidSourceUrlInput, normalizeUserSourceUrl, sanitizeSourceUrlInput } from '../utils/gitSourceUrl.ts'

export type AddSystemSubmitInput =
  | { name: string; sourceKind: 'git'; url: string }
  | { name: string; sourceKind: 'localFolder'; localFolderPath: string }

type AddSystemModalProps = {
  open: boolean
  onClose: () => void
  onFinished: (systemId: string) => void
  flowSystemId: string | null
  onRegisterSystem: (input: AddSystemSubmitInput) => ManagedSystem
  onUpdateSystemSource: (systemId: string, input: AddSystemSubmitInput) => void
  getAnalysisState: (systemId: string) => SystemAnalysisUiState
  getPlanState: (systemId: string) => InstallationPlanUiState
  getInstallState: (systemId: string) => InstallationUiState
  getProgress: (systemId: string) => InstallationProgressSnapshot | null | undefined
  onRunAnalyze: (systemId: string, input: AddSystemSubmitInput) => Promise<void>
  onRunInstall: (
    systemId: string,
    accessMode: SystemAccessMode,
    overlayEnabled?: boolean,
  ) => Promise<void>
  onResumeDockerInstall: (systemId: string) => Promise<void>
  onLaunchDocker: () => void
  dockerInstallBusy: boolean
  dockerInstallDetail?: string
  serverEnvironmentReady: boolean
}

type WizardStep = 'origem' | 'analise' | 'instalacao' | 'conclusao'

function validateInput(input: {
  name: string
  sourceKind: SystemSourceKind
  url: string
  localFolderPath: string
}): { ok: true; data: AddSystemSubmitInput } | { ok: false; nameError: string; urlError: string; folderError: string } {
  const nextName = input.name.trim()
  const nameError = nextName ? '' : 'Informe o nome do sistema.'

  if (input.sourceKind === 'git') {
    const nextUrlError = isValidSourceUrlInput(input.url)
      ? ''
      : 'URL inválida. Cole o link completo do GitHub, com https:// (ex.: .../AcompSolemp/tree/cursor/servidor-lan-etapa16-bcc8).'
    if (nameError || nextUrlError) {
      return { ok: false, nameError, urlError: nextUrlError, folderError: '' }
    }
    return {
      ok: true,
      data: {
        name: nextName,
        sourceKind: 'git',
        url: normalizeUserSourceUrl(sanitizeSourceUrlInput(input.url)),
      },
    }
  }

  const folderError = input.localFolderPath.trim() ? '' : 'Selecione a pasta do projeto no computador.'
  if (nameError || folderError) {
    return { ok: false, nameError, urlError: '', folderError }
  }
  return {
    ok: true,
    data: {
      name: nextName,
      sourceKind: 'localFolder',
      localFolderPath: input.localFolderPath.trim(),
    },
  }
}

function resolveWizardStep(input: {
  flowSystemId: string | null
  analysisState: SystemAnalysisUiState
  installState: InstallationUiState
}): WizardStep {
  if (
    input.installState.phase === 'success' ||
    (input.installState.phase === 'error' && input.flowSystemId)
  ) {
    return 'conclusao'
  }
  if (
    input.installState.phase === 'loading' ||
    input.installState.phase === 'awaiting_docker' ||
    input.analysisState.phase === 'success'
  ) {
    if (input.installState.phase === 'loading' || input.installState.phase === 'awaiting_docker') {
      return 'instalacao'
    }
    return 'analise'
  }
  if (input.analysisState.phase === 'loading') return 'analise'
  return 'origem'
}

export function AddSystemModal({
  open,
  onClose,
  onFinished,
  flowSystemId,
  onRegisterSystem,
  onUpdateSystemSource,
  getAnalysisState,
  getPlanState,
  getInstallState,
  getProgress,
  onRunAnalyze,
  onRunInstall,
  onResumeDockerInstall,
  onLaunchDocker,
  dockerInstallBusy,
  dockerInstallDetail,
  serverEnvironmentReady,
}: AddSystemModalProps) {
  const titleId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [sourceKind, setSourceKind] = useState<SystemSourceKind>('git')
  const [url, setUrl] = useState('')
  const [localFolderPath, setLocalFolderPath] = useState('')
  const [localFolderLabel, setLocalFolderLabel] = useState('')
  const [nameError, setNameError] = useState('')
  const [urlError, setUrlError] = useState('')
  const [folderError, setFolderError] = useState('')
  const [pickBusy, setPickBusy] = useState(false)
  const [analyzeBusy, setAnalyzeBusy] = useState(false)
  const [accessMode, setAccessMode] = useState<SystemAccessMode | null>(null)
  const [overlayEnabled, setOverlayEnabled] = useState(false)

  const analysisState = flowSystemId ? getAnalysisState(flowSystemId) : { phase: 'idle' as const }
  const planState = flowSystemId ? getPlanState(flowSystemId) : { phase: 'idle' as const, visible: false }
  const installState = flowSystemId ? getInstallState(flowSystemId) : { phase: 'idle' as const }
  const progress = flowSystemId ? (getProgress(flowSystemId) ?? null) : null

  const wizardStep = resolveWizardStep({ flowSystemId, analysisState, installState })
  const plan =
    planState.phase === 'success' || planState.phase === 'loading' || planState.phase === 'error'
      ? planState.plan
      : undefined
  const planIsManifest = plan?.packageManager === 'manifest'
  const flowBusy =
    analyzeBusy ||
    analysisState.phase === 'loading' ||
    planState.phase === 'loading' ||
    installState.phase === 'loading'

  const canClose = !flowBusy && installState.phase !== 'awaiting_docker'

  const canAnalyze = !flowBusy && installState.phase !== 'success'

  const analysisReady = analysisState.phase === 'success' && Boolean(analysisState.result)
  const planReady = Boolean(plan) && planState.phase !== 'loading' && planState.phase !== 'error'

  const canInstall =
    analysisReady &&
    planReady &&
    serverEnvironmentReady &&
    installState.phase === 'idle' &&
    accessMode !== null

  const httpPort = plan?.identifiedPorts?.[0] ?? 8080

  useEffect(() => {
    if (!open) return
    setName('')
    setSourceKind('git')
    setUrl('')
    setLocalFolderPath('')
    setLocalFolderLabel('')
    setNameError('')
    setUrlError('')
    setFolderError('')
    setAccessMode(null)
    setOverlayEnabled(false)
    setAnalyzeBusy(false)
    nameRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && canClose) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, canClose])

  const stepLabels = useMemo(
    () =>
      [
        { id: 'origem' as const, label: '1. Origem' },
        { id: 'analise' as const, label: '2. Análise' },
        { id: 'instalacao' as const, label: '3. Instalação' },
        { id: 'conclusao' as const, label: '4. Conclusão' },
      ] as const,
    [],
  )

  if (!open) return null

  async function handlePickFolder() {
    setFolderError('')
    setPickBusy(true)
    try {
      const picked = await pickLocalProjectFolder()
      if (picked.ok) {
        setLocalFolderPath(picked.path)
        setLocalFolderLabel(picked.label ?? '')
        return
      }
      if (picked.cancelled) return
      setFolderError(picked.message)
    } finally {
      setPickBusy(false)
    }
  }

  async function handleAnalyzeClick() {
    const validated = validateInput({ name, sourceKind, url, localFolderPath })
    if (!validated.ok) {
      setNameError(validated.nameError)
      setUrlError(validated.urlError)
      setFolderError(validated.folderError)
      return
    }

    setAnalyzeBusy(true)
    try {
      let systemId = flowSystemId
      if (!systemId) {
        const created = onRegisterSystem(validated.data)
        systemId = created.id
      } else {
        onUpdateSystemSource(systemId, validated.data)
      }
      await onRunAnalyze(systemId, validated.data)
    } finally {
      setAnalyzeBusy(false)
    }
  }

  async function handleInstallClick() {
    if (!flowSystemId || !accessMode) return
    await onRunInstall(
      flowSystemId,
      accessMode,
      planIsManifest && accessMode === 'lan' ? overlayEnabled : false,
    )
  }

  function handleBackdropClick() {
    if (canClose) onClose()
  }

  return (
    <div className="modal-backdrop modal-backdrop-blocking" onClick={handleBackdropClick}>
      <div
        className="modal modal-add-system-flow"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-add-system-header">
          <div>
            <h2 id={titleId}>Adicionar sistema</h2>
            <p className="modal-description">
              Cadastre a origem, analise o projeto e instale sem sair deste assistente.
            </p>
          </div>
          <nav className="add-system-steps" aria-label="Etapas">
            {stepLabels.map((step) => (
              <span
                key={step.id}
                className={
                  wizardStep === step.id
                    ? 'add-system-step add-system-step-active'
                    : 'add-system-step'
                }
              >
                {step.label}
              </span>
            ))}
          </nav>
        </header>

        <div className="modal-add-system-body">
          <section className="add-system-section" aria-labelledby={`${titleId}-origem`}>
            <h3 id={`${titleId}-origem`} className="add-system-section-title">
              Origem do projeto
            </h3>
            <fieldset className="field add-system-field-reset">
              <legend className="visually-hidden">Origem do projeto</legend>
              <span>Origem</span>
              <div className="add-system-origin-options">
                <label className="add-system-radio">
                  <input
                    type="radio"
                    name="sourceKind"
                    checked={sourceKind === 'git'}
                    disabled={flowBusy}
                    onChange={() => setSourceKind('git')}
                  />
                  Repositório Git
                </label>
                <label className="add-system-radio">
                  <input
                    type="radio"
                    name="sourceKind"
                    checked={sourceKind === 'localFolder'}
                    disabled={flowBusy}
                    onChange={() => setSourceKind('localFolder')}
                  />
                  Pasta local
                </label>
              </div>
            </fieldset>

            <label className="field">
              <span>Nome do sistema</span>
              <input
                ref={nameRef}
                value={name}
                disabled={flowBusy}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
              {nameError ? <small className="field-error">{nameError}</small> : null}
            </label>

            {sourceKind === 'git' ? (
              <label className="field">
                <span>URL do repositório</span>
                <input
                  value={url}
                  disabled={flowBusy}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://github.com/usuario/projeto"
                  autoComplete="off"
                  inputMode="url"
                />
                {urlError ? <small className="field-error">{urlError}</small> : null}
                <small className="field-hint">
                  Use o link do código-fonte no GitHub/GitLab (não o site publicado em github.io).
                </small>
              </label>
            ) : (
              <div className="field">
                <span>Pasta do projeto</span>
                <div className="add-system-folder-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={pickBusy || flowBusy}
                    onClick={() => void handlePickFolder()}
                  >
                    {pickBusy
                      ? window.servidorManager?.pickProjectFolder
                        ? 'Abrindo…'
                        : 'Enviando pasta…'
                      : localFolderPath
                        ? 'Escolher outra pasta'
                        : 'Selecionar pasta…'}
                  </button>
                  {localFolderPath ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={flowBusy}
                      onClick={() => {
                        setLocalFolderPath('')
                        setLocalFolderLabel('')
                        setFolderError('')
                      }}
                    >
                      Limpar
                    </button>
                  ) : null}
                </div>
                {localFolderPath ? (
                  <p className="field-hint add-system-path">
                    {localFolderLabel ? (
                      <>
                        <strong>Pasta:</strong> {localFolderLabel}
                        <br />
                      </>
                    ) : null}
                    <strong>Origem no servidor:</strong> {localFolderPath}
                  </p>
                ) : (
                  <small className="field-hint">
                    No navegador (Chrome/Edge), use o seletor de pasta quando disponível; os arquivos são
                    enviados ao serviço local para análise. No Electron, o seletor nativo do Windows é
                    utilizado.
                  </small>
                )}
                {folderError ? <small className="field-error">{folderError}</small> : null}
              </div>
            )}
          </section>

          {(wizardStep === 'analise' ||
            wizardStep === 'instalacao' ||
            wizardStep === 'conclusao' ||
            analysisState.phase === 'error') && (
            <section className="add-system-section">
              <h3 className="add-system-section-title">Análise do projeto</h3>
              <SystemAnalysisPanel
                loading={analysisState.phase === 'loading' || analyzeBusy}
                error={analysisState.phase === 'error' ? analysisState.error : undefined}
                result={analysisState.phase === 'success' ? analysisState.result : undefined}
              />
            </section>
          )}

          {analysisReady ? (
            <section className="add-system-section">
              <h3 className="add-system-section-title">Plano de instalação</h3>
              <InstallationPlanPanel
                loading={planState.phase === 'loading'}
                error={planState.phase === 'error' ? planState.error : undefined}
                plan={plan}
              />
            </section>
          ) : null}

          {analysisReady && planReady && installState.phase !== 'success' && installState.phase !== 'error' ? (
            <section className="add-system-section">
              <h3 className="add-system-section-title">Modo de acesso</h3>
              <p className="analysis-disclaimer">
                Escolha como utilizadores vão abrir o sistema após a instalação.
              </p>
              <SystemAccessModeCards
                selected={accessMode}
                onSelect={setAccessMode}
                localExample={`http://127.0.0.1:${httpPort}/login`}
                lanExample={`http://192.168.x.x:${httpPort}/login`}
              />
              {!accessMode ? (
                <p className="analysis-disclaimer">
                  Selecione <strong>Local</strong> ou <strong>Rede local (LAN)</strong> para habilitar Instalar.
                </p>
              ) : null}
              {planIsManifest && accessMode === 'lan' ? (
                <label className="manifest-overlay-option">
                  <input
                    type="checkbox"
                    checked={overlayEnabled}
                    disabled={installState.phase === 'loading'}
                    onChange={(event) => setOverlayEnabled(event.target.checked)}
                  />
                  Overlay WireGuard opcional (fase overlay.server; distinto da rede local)
                </label>
              ) : null}
              {!serverEnvironmentReady ? (
                <p className="analysis-disclaimer analysis-panel-error">
                  Conclua a preparação do servidor no <strong>Dashboard</strong> (“Preparar este computador”) antes de
                  instalar pelo manifesto.
                </p>
              ) : null}
            </section>
          ) : null}

          {(installState.phase === 'loading' ||
            installState.phase === 'awaiting_docker' ||
            progress) &&
          installState.phase !== 'success' &&
          installState.phase !== 'error' ? (
            <section className="add-system-section">
              <h3 className="add-system-section-title">Progresso da instalação</h3>
              {installState.phase === 'awaiting_docker' ? (
                <div className="modal-note">
                  <p className="analysis-title">{DOCKER_INSTALL_MODAL_MESSAGE}</p>
                  {dockerInstallDetail ? <p>{dockerInstallDetail}</p> : null}
                  <div className="add-system-folder-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={dockerInstallBusy}
                      onClick={onLaunchDocker}
                    >
                      Abrir Docker
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={dockerInstallBusy}
                      onClick={() => flowSystemId && void onResumeDockerInstall(flowSystemId)}
                    >
                      Verificar novamente
                    </button>
                  </div>
                </div>
              ) : null}
              <InstallationProgressContent
                systemName={name.trim() || 'Sistema'}
                installState={installState}
                progress={progress}
              />
            </section>
          ) : null}

          {wizardStep === 'conclusao' ? (
            <section className="add-system-section">
              <h3 className="add-system-section-title">Resultado</h3>
              <InstallationResultPanel
                loading={installState.phase === 'loading'}
                error={installState.phase === 'error' ? installState.error : undefined}
                result={
                  installState.phase === 'success' || installState.phase === 'error'
                    ? installState.result
                    : undefined
                }
              />
            </section>
          ) : null}
        </div>

        <footer className="modal-add-system-footer modal-actions">
          {installState.phase === 'success' && flowSystemId ? (
            <>
              <button type="button" className="button button-secondary" onClick={onClose}>
                Fechar assistente
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => onFinished(flowSystemId)}
              >
                Ver em Meus Sistemas
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button button-secondary" disabled={!canClose} onClick={onClose}>
                Cancelar
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={!canAnalyze}
                onClick={() => void handleAnalyzeClick()}
              >
                {analysisState.phase === 'loading' || analyzeBusy ? 'Analisando…' : 'Analisar'}
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={!canInstall}
                onClick={() => void handleInstallClick()}
              >
                {installState.phase === 'loading' ? 'Instalando…' : 'Instalar'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
