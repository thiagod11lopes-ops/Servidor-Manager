import { useCallback, useEffect, useState } from 'react'
import { BundledOmpsDuplicateInstallModal } from '../components/BundledOmpsDuplicateInstallModal.tsx'
import { FixedLanPort8080ConflictModal } from '../components/FixedLanPort8080ConflictModal.tsx'
import { SystemAccessModeCards } from '../components/ChooseSystemAccessModeModal.tsx'
import { ServerIcon } from '../components/Icons.tsx'
import { localManagerService } from '../services/index.ts'
import type { BundledOmpsInstallResponse, BundledOmpsStatus } from '../types/bundledOmps.ts'
import type {
  BundledOmpsInstallDuplicateDecision,
  InstallationDuplicateConflict,
} from '../types/installationDuplicate.ts'
import type { BundledOmpsIncompleteDuplicate } from '../components/BundledOmpsDuplicateInstallModal.tsx'
import {
  handlingForDuplicateMessage,
  handlingFromInstallFailure,
  resolveDuplicateFromServicePayload,
  shouldRenderOmpsSetupPageMessage,
} from '../utils/bundledOmpsDuplicateInstallFlow.ts'
import type { SystemAccessMode } from '../types/systemAccessMode.ts'
import type { InstallationProgressSnapshot } from '../types/installationProgress.ts'
import { isPackagedBundledOmpsProduct } from '../utils/packagedBundledOmps.ts'

export type BundledOmpsSetupPageProps = {
  onOpenSystems: () => void
  onOpenServer: (systemId: string) => void
}

export function BundledOmpsSetupPage({ onOpenSystems, onOpenServer }: BundledOmpsSetupPageProps) {
  const [status, setStatus] = useState<BundledOmpsStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accessMode, setAccessMode] = useState<SystemAccessMode>('lan')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [systemId, setSystemId] = useState<string | null>(null)
  const [progress, setProgress] = useState<InstallationProgressSnapshot | null>(null)
  const [duplicateConflict, setDuplicateConflict] = useState<InstallationDuplicateConflict | null>(null)
  const [duplicateIncomplete, setDuplicateIncomplete] =
    useState<BundledOmpsIncompleteDuplicate | null>(null)
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [port8080ModalOpen, setPort8080ModalOpen] = useState(false)

  const packagedOmps = isPackagedBundledOmpsProduct()
  const activeSystemId =
    systemId ?? (status?.ok === true && status.available ? status.firstRun?.systemId ?? null : null)

  function suggestsPort8080Conflict(...texts: Array<string | null | undefined>): boolean {
    return texts.some(
      (text) =>
        typeof text === 'string' &&
        (/8080|FIXED_LAN_HTTP_PORT_CONFLICT|porta HTTP 8080/i.test(text) ||
          /j[aá]\s+est[aá]\s+em\s+escuta/i.test(text)),
    )
  }

  const refreshStatus = useCallback(async () => {
    try {
      const next = await localManagerService.getBundledOmpsStatus()
      setStatus(next)
      if (next.ok === true && next.available && next.firstRun?.systemId) {
        setSystemId((prev) => prev ?? next.firstRun!.systemId)
      }
      setLoadError(null)
    } catch {
      setLoadError('Não foi possível consultar o pacote Servidor OMPS (serviço local indisponível).')
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!systemId) return
    const timer = setInterval(() => {
      void localManagerService.getInstallationProgress(systemId).then((r) => {
        if (r.ok) setProgress(r.progress ?? null)
      })
    }, 800)
    return () => clearInterval(timer)
  }, [systemId])

  const openDuplicateModal = useCallback(
    (input: {
      conflict?: InstallationDuplicateConflict | null
      incomplete?: BundledOmpsIncompleteDuplicate | null
    }) => {
      setDuplicateConflict(input.conflict ?? null)
      setDuplicateIncomplete(input.incomplete ?? null)
      setDuplicateModalOpen(true)
      setMessage(null)
      setDuplicateError(null)
    },
    [],
  )

  const resolveDuplicateViaCheck = useCallback(async (): Promise<InstallationDuplicateConflict | null> => {
    try {
      const payload = await localManagerService.checkBundledOmpsInstallationDuplicate()
      return resolveDuplicateFromServicePayload(payload)
    } catch {
      return null
    }
  }, [])

  const applyDuplicateFailureHandling = useCallback(
    async (handling: ReturnType<typeof handlingForDuplicateMessage>) => {
      if (handling.kind === 'duplicate_modal') {
        openDuplicateModal({ conflict: handling.conflict })
        return
      }
      if (handling.kind === 'duplicate_incomplete_modal') {
        openDuplicateModal({
          incomplete: { message: handling.message, detail: handling.detail },
        })
        return
      }
      setMessage(handling.message)
    },
    [openDuplicateModal],
  )

  const applyInstallResponse = useCallback(
    async (response: BundledOmpsInstallResponse) => {
      if ('paused' in response && response.paused) {
        setSystemId(response.systemId)
        setMessage(response.message)
        return
      }
      if (!response.ok) {
        const resolved = await resolveDuplicateViaCheck()
        const failureHandling = handlingFromInstallFailure(response, resolved)
        if (failureHandling) {
          await applyDuplicateFailureHandling(failureHandling)
          if (duplicateModalOpen && failureHandling.kind === 'page_message') {
            setDuplicateError(failureHandling.message)
          }
          return
        }
        const text = 'message' in response ? response.message : 'Falha ao iniciar instalação.'
        setMessage(text)
        if (duplicateModalOpen) setDuplicateError(text)
        return
      }
      setDuplicateModalOpen(false)
      setDuplicateConflict(null)
      setDuplicateIncomplete(null)
      setSystemId(response.systemId)
      setMessage(response.message)
      await refreshStatus()
    },
    [applyDuplicateFailureHandling, duplicateModalOpen, refreshStatus, resolveDuplicateViaCheck],
  )

  const runInstall = useCallback(
    async (duplicateDecision?: BundledOmpsInstallDuplicateDecision) => {
      setBusy(true)
      setMessage(null)
      setDuplicateError(null)
      try {
        if (!duplicateDecision) {
          try {
            const checkPayload = await localManagerService.checkBundledOmpsInstallationDuplicate()
            const precheck = resolveDuplicateFromServicePayload(checkPayload)
            if (precheck) {
              openDuplicateModal({ conflict: precheck })
              return
            }
            if (
              checkPayload &&
              typeof checkPayload === 'object' &&
              (checkPayload as Record<string, unknown>).duplicate === true
            ) {
              const msg =
                typeof (checkPayload as Record<string, unknown>).message === 'string'
                  ? String((checkPayload as Record<string, unknown>).message)
                  : 'Já existe uma instalação correspondente a este pacote.'
              await applyDuplicateFailureHandling(handlingForDuplicateMessage(msg, null))
              return
            }
          } catch {
            // duplicate-check indisponível — segue para resposta do install (409)
          }
        }
        const response = await localManagerService.installBundledOmpsServer({
          accessMode,
          duplicateDecision,
        })
        await applyInstallResponse(response)
      } finally {
        setBusy(false)
      }
    },
    [accessMode, applyDuplicateFailureHandling, applyInstallResponse, openDuplicateModal],
  )

  async function handleInstall() {
    await runInstall()
  }

  async function handleDuplicateResume(existingSystemId: string) {
    await runInstall({ action: 'resume', systemId: existingSystemId })
  }

  async function handleDuplicateReplace(existingSystemId: string) {
    await runInstall({
      action: 'replace',
      systemId: existingSystemId,
      confirmReplace: true,
    })
  }

  const completed =
    status?.ok === true &&
    status.available &&
    (status.firstRun?.completed === true || progress?.status === 'succeeded')

  const installing =
    busy ||
    progress?.status === 'running' ||
    progress?.status === 'awaiting_docker' ||
    (systemId != null && progress != null && progress.status !== 'succeeded' && progress.status !== 'failed')

  const failed = progress?.status === 'failed'

  const currentPhaseLabel =
    progress?.phases.find((p) => p.id === progress.currentPhaseId)?.label ??
    (progress?.status === 'awaiting_docker' ? 'Aguardando Docker' : null)

  return (
    <>
      {activeSystemId ? (
        <FixedLanPort8080ConflictModal
          open={port8080ModalOpen}
          systemId={activeSystemId}
          busy={busy}
          onClose={() => setPort8080ModalOpen(false)}
          onReleased={() => {
            setPort8080ModalOpen(false)
            setMessage('Porta 8080 liberada. Você pode continuar a instalação.')
            void runInstall()
          }}
        />
      ) : null}

      <BundledOmpsDuplicateInstallModal
        open={duplicateModalOpen}
        conflict={duplicateConflict}
        incompleteDuplicate={duplicateIncomplete}
        busy={busy}
        errorMessage={duplicateError}
        onClose={() => {
          if (busy) return
          setDuplicateModalOpen(false)
          setDuplicateConflict(null)
          setDuplicateIncomplete(null)
          setDuplicateError(null)
        }}
        onResume={(id) => void handleDuplicateResume(id)}
        onReplace={(id) => void handleDuplicateReplace(id)}
        onOpenExisting={(id) => {
          setDuplicateModalOpen(false)
          onOpenServer(id)
        }}
      />
    <div className={`page-content bundled-omps-setup${packagedOmps ? ' bundled-omps-setup-packaged' : ''}`}>
      <header className="omps-setup-hero">
        <div className="omps-setup-hero-icon" aria-hidden="true">
          <ServerIcon width={32} height={32} />
        </div>
        <h1 className="omps-setup-hero-title">Instalar Servidor OMPS</h1>
        <p className="omps-setup-hero-lead">
          Instale o servidor OMPS a partir do pacote incluído nesta instalação — sem repositório Git nem
          download externo do aplicativo.
        </p>
      </header>

      {loadError ? (
        <div className="omps-setup-alert omps-setup-alert-error" role="alert">
          {loadError}
        </div>
      ) : null}

      {status?.ok === true && !status.available ? (
        <div className="omps-setup-alert omps-setup-alert-error" role="alert">
          {status.reason}
        </div>
      ) : null}

      {status?.ok === true && status.available ? (
        <div className="omps-setup-panel">
          {!completed ? (
            <>
              <section className="omps-setup-section" aria-labelledby="omps-access-heading">
                <h2 id="omps-access-heading" className="omps-setup-section-title">
                  Como deseja acessar o OMPS?
                </h2>
                <SystemAccessModeCards
                  selected={accessMode}
                  onSelect={setAccessMode}
                  localBadge={null}
                  localTitle="Somente neste computador"
                  lanTitle="Rede local (LAN)"
                  localDescription="Uso no próprio PC servidor (localhost). Ideal quando só esta máquina acessa o sistema."
                  lanDescription="Outros dispositivos na mesma rede Wi‑Fi ou cabo acessam pelo endereço IPv4 deste servidor."
                  showExamples={false}
                  showSelectedMark
                  className="omps-setup-access-cards"
                />
              </section>

              <div className="omps-setup-primary-action">
                <button
                  type="button"
                  className="btn primary omps-setup-install-btn"
                  disabled={busy || installing}
                  onClick={() => void handleInstall()}
                >
                  {busy || installing ? 'Instalação em andamento…' : 'Instalar Servidor OMPS'}
                </button>
              </div>
            </>
          ) : (
            <div className="omps-setup-success" role="status">
              <p className="omps-setup-success-title">Instalação concluída</p>
              <p className="omps-setup-success-text">
                O Servidor OMPS está pronto. Abra a execução ou gerencie em Meus Sistemas.
              </p>
              {status.firstRun?.systemId ? (
                <div className="omps-setup-success-actions">
                  <button type="button" className="btn" onClick={() => onOpenSystems()}>
                    Meus Sistemas
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => onOpenServer(status.firstRun!.systemId)}
                  >
                    Abrir execução
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {shouldRenderOmpsSetupPageMessage(message, duplicateModalOpen) ? (
            <p className={`omps-setup-message${failed ? ' omps-setup-message-error' : ''}`}>{message}</p>
          ) : null}

          {activeSystemId &&
          (failed || suggestsPort8080Conflict(message, progress?.error)) &&
          !completed ? (
            <div className="omps-setup-primary-action">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setPort8080ModalOpen(true)}
              >
                Diagnosticar conflito na porta 8080
              </button>
            </div>
          ) : null}

          {progress && (installing || failed || progress.status === 'succeeded') ? (
            <section className="omps-setup-progress" aria-live="polite">
              <div className="install-progress-bar omps-setup-progress-bar">
                <div
                  className="install-progress-bar-fill"
                  style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
                />
              </div>
              <p className="omps-setup-progress-meta">
                <span className="install-progress-percent">{progress.percent}%</span>
                {currentPhaseLabel ? ` — ${currentPhaseLabel}` : null}
                {failed && progress.error ? ` — ${progress.error}` : null}
              </p>
            </section>
          ) : null}

          <details className="omps-setup-tech-details">
            <summary>Detalhes técnicos</summary>
            <dl className="omps-setup-tech-list">
              <div>
                <dt>Produto</dt>
                <dd>{status.displayName}</dd>
              </div>
              <div>
                <dt>Versão OMPS</dt>
                <dd>{status.ompsVersion}</dd>
              </div>
              <div>
                <dt>Revisão</dt>
                <dd>
                  {status.ompsGitSha
                    ? `Git ${status.ompsGitSha}`
                    : `${status.sourceRevisionKind ?? 'content-sha256'}: ${status.payloadContentSha256}`}
                </dd>
              </div>
              <div>
                <dt>Arquivos no payload</dt>
                <dd>{status.payloadFileCount}</dd>
              </div>
            </dl>
          </details>
        </div>
      ) : null}

      <footer className="omps-setup-footnote">
        <p>
          <strong>Requisitos:</strong> Docker Desktop, Supabase CLI, Caddy e demais ferramentas descritas no
          manifesto devem estar disponíveis neste computador.
        </p>
        <p>
          A primeira subida do Supabase pode exigir <strong>internet</strong> para baixar imagens Docker —
          o instalador do aplicativo em si não depende de GitHub.
        </p>
      </footer>
    </div>
    </>
  )
}
