import { InstallationPlanPanel } from './InstallationPlanPanel.tsx'
import { SystemAccessModeCards } from './ChooseSystemAccessModeModal.tsx'
import { InstallationResultPanel } from './InstallationResultPanel.tsx'
import { SystemAnalysisPanel } from './SystemAnalysisPanel.tsx'
import { SystemDatabasePanel } from './SystemDatabasePanel.tsx'
import { SystemManifestMaintenancePanel } from './SystemManifestMaintenancePanel.tsx'
import { SystemAccessPanel } from './SystemAccessPanel.tsx'
import { SystemRuntimePanel } from './SystemRuntimePanel.tsx'
import { SystemServicePanel } from './SystemServicePanel.tsx'
import type { InstallationPlanUiState } from '../hooks/useInstallationPlan.ts'
import type { InstallationUiState } from '../hooks/useSystemInstallation.ts'
import type { DatabaseUiState } from '../hooks/useSystemDatabase.ts'
import type { ManifestMaintenanceUiState } from '../hooks/useManifestMaintenance.ts'
import type { RuntimeUiState } from '../hooks/useSystemRuntime.ts'
import type { ServiceUiState } from '../hooks/useSystemService.ts'
import type { SystemAnalysisUiState } from '../hooks/useSystemAnalysis.ts'
import { DashboardExpandableCard, type DashboardCardStatusTone } from './DashboardExpandableCard.tsx'
import {
  checklistCardStatus,
  ServerOperationalChecklistPanel,
} from './ServerOperationalChecklistPanel.tsx'
import type { ManagedSystem } from '../types/system.ts'
import { displayTechnology, systemStatusLabel } from '../types/system.ts'
import { displaySystemSource } from '../types/projectSource.ts'
import type { ServerBootstrapStatus } from '../types/serverBootstrap.ts'
import type { ChecklistActionTarget } from '../utils/serverOperationalChecklist.ts'
import { isAcompSolempSystem } from '../utils/isAcompSolempSystem.ts'
import { installationPlanForAccessMode } from '../utils/installationPlanForAccessMode.ts'
import type { SystemAccessMode } from '../types/systemAccessMode.ts'
import { systemRuntimeStateLabel } from '../types/systemRuntime.ts'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'

function runtimeCardStatus(status?: SystemRuntimeStatus): { label: string; tone: DashboardCardStatusTone } {
  if (!status?.state) return { label: 'Indisponível', tone: 'muted' }
  const label = systemRuntimeStateLabel[status.state] ?? status.state
  if (status.state === 'executando') return { label, tone: 'success' }
  if (status.state === 'erro') return { label, tone: 'error' }
  return { label, tone: 'normal' }
}

type SystemCardProps = {
  system: ManagedSystem
  analysisState: SystemAnalysisUiState
  planState: InstallationPlanUiState
  installState: InstallationUiState
  runtimeState: RuntimeUiState
  databaseState: DatabaseUiState
  onAnalyze: (systemId: string) => void
  onRequestPlan: (systemId: string) => void
  onInstall: (systemId: string) => void
  /** Instalação em andamento com modal oculto pelo usuário. */
  installProgressHidden?: boolean
  onShowInstallProgress?: () => void
  onStart: (systemId: string) => void
  onStop: (systemId: string) => void
  onRestart: (systemId: string) => void
  onRefreshRuntime: (systemId: string) => void
  onProvisionDatabase: (systemId: string, admin: import('../types/database.ts').PostgresAdminCredentialsInput) => void
  serviceState: ServiceUiState
  onInstallService: (systemId: string, automaticStartup: boolean) => void
  onUninstallService: (systemId: string) => void
  onStartService: (systemId: string) => void
  onStopService: (systemId: string) => void
  onRestartService: (systemId: string) => void
  onSetServiceAuto: (systemId: string, enabled: boolean) => void
  onRefreshService: (systemId: string) => void
  onConfigure: (systemId: string) => void
  onRemove: (systemId: string) => void
  manifestMaintenanceState?: ManifestMaintenanceUiState
  manifestOverlayInstall?: boolean
  onManifestOverlayInstallChange?: (enabled: boolean) => void
  /** Escolha prévia no painel, só para plano manifesto. Outros sistemas continuam no diálogo ao instalar. */
  manifestAccessMode?: SystemAccessMode | null
  onManifestAccessModeChange?: (mode: SystemAccessMode) => void
  onManifestBackup?: (systemId: string) => void
  onManifestUpdate?: (systemId: string, skipBackup: boolean) => void
  /** false bloqueia Instalar até o Dashboard reportar preparação OK. */
  serverEnvironmentReady?: boolean
  serverBootstrapLoading?: boolean
  serverBootstrapStatus?: ServerBootstrapStatus | null
  onChecklistAction?: (target: ChecklistActionTarget) => void
  /** Gate Docker antes da análise (Supabase local). */
  dockerPrepareActive?: boolean
}

function hasRealAnalysis(system: ManagedSystem, analysisState: SystemAnalysisUiState): boolean {
  const analysis = analysisState.result ?? system.analysis
  return Boolean(analysis && analysis.source === 'local-service' && !analysis.mock)
}

export function SystemCard({
  system,
  analysisState,
  planState,
  installState,
  onAnalyze,
  onRequestPlan,
  onInstall,
  installProgressHidden = false,
  onShowInstallProgress,
  runtimeState,
  onStart,
  onStop,
  onRestart,
  onRefreshRuntime,
  databaseState,
  onProvisionDatabase,
  serviceState,
  onInstallService,
  onUninstallService,
  onStartService,
  onStopService,
  onRestartService,
  onSetServiceAuto,
  onRefreshService,
  onConfigure,
  onRemove,
  manifestMaintenanceState,
  manifestOverlayInstall,
  onManifestOverlayInstallChange,
  manifestAccessMode = null,
  onManifestAccessModeChange,
  onManifestBackup,
  onManifestUpdate,
  serverEnvironmentReady = true,
  serverBootstrapLoading = false,
  serverBootstrapStatus = null,
  onChecklistAction,
  dockerPrepareActive = false,
}: SystemCardProps) {
  const analyzing = analysisState.phase === 'loading' || dockerPrepareActive
  const panelResult = analysisState.result ?? system.analysis
  const showAnalysisPanel =
    analyzing || analysisState.phase === 'error' || analysisState.phase === 'success' || Boolean(panelResult)

  const canViewPlan = hasRealAnalysis(system, analysisState)
  const storedPlan = planState.plan ?? system.installationPlan
  const effectivePlan = installationPlanForAccessMode(
    storedPlan,
    storedPlan?.packageManager === 'manifest' ? manifestAccessMode : null,
  )
  const showPlanPanel = planState.visible && (planState.phase !== 'idle' || Boolean(effectivePlan))
  const canInstall =
    canViewPlan &&
    system.status !== 'instalado' &&
    Boolean(effectivePlan?.source === 'local-service')
  const needsInstallationPlan =
    canViewPlan && system.status !== 'instalado' && !effectivePlan
  const showDatabasePanel =
    hasRealAnalysis(system, analysisState) ||
    Boolean(system.installationPlan?.database) ||
    system.status === 'instalado'
  const planDatabase = planState.plan?.database ?? system.installationPlan?.database
  const showInstallPanel =
    installState.phase === 'loading' ||
    installState.phase === 'error' ||
    installState.phase === 'success' ||
    Boolean(system.installation)

  const isInstalled = system.status === 'instalado'
  const runtimeStatus = runtimeState.status ?? system.runtime
  const runtimeBusy =
    runtimeState.phase === 'loading' ||
    runtimeStatus?.state === 'iniciando' ||
    runtimeStatus?.state === 'encerrando'
  const isRunning = runtimeStatus?.state === 'executando'
  const planIsManifest = effectivePlan?.packageManager === 'manifest'
  const analysisManifest = Boolean(analysisState.result?.serverManifest ?? system.analysis?.serverManifest)
  const analysisIsMock = Boolean(
    (analysisState.result ?? system.analysis)?.mock || (analysisState.result ?? system.analysis)?.source === 'mock',
  )
  const acompUrlWithoutManifestBranch =
    /acompsolemp/i.test(system.url) &&
    !/\/tree\//i.test(system.url) &&
    canViewPlan &&
    !analysisManifest
  const isManifestLan =
    runtimeStatus?.runtimeKind === 'manifest-lan' || (isInstalled && planIsManifest) || analysisManifest

  const canStart =
    isInstalled &&
    serverEnvironmentReady &&
    !runtimeBusy &&
    !isRunning &&
    runtimeStatus?.state !== 'iniciando'

  const startDisabledReason = (() => {
    if (!isInstalled) return 'Sistema ainda não instalado.'
    if (!serverEnvironmentReady) {
      return 'Preparar o PC no Dashboard (Preparar PC) antes de iniciar.'
    }
    if (runtimeState.phase === 'loading') return 'Comando de início em andamento…'
    if (runtimeStatus?.state === 'iniciando') return 'Início em andamento — aguarde o Caddy na porta HTTP.'
    if (runtimeStatus?.state === 'encerrando') return 'Parada em andamento…'
    if (isRunning || (isManifestLan && runtimeStatus?.caddyRunning)) {
      return 'Já em execução — use o link de acesso acima.'
    }
    return undefined
  })()

  const showServerChecklist =
    isAcompSolempSystem(system, runtimeStatus) && typeof onChecklistAction === 'function'
  const canStop = isInstalled && !runtimeBusy && (isRunning || (isManifestLan && runtimeStatus?.caddyRunning))
  const canRestart =
    isInstalled && !runtimeBusy && (isRunning || (isManifestLan && runtimeStatus?.caddyRunning))

  const analysisBlock =
    showAnalysisPanel ? (
      <SystemAnalysisPanel
        loading={analyzing}
        error={analysisState.phase === 'error' ? analysisState.error : undefined}
        result={panelResult}
      />
    ) : null

  const planBlock =
    showPlanPanel ? (
      <InstallationPlanPanel
        loading={planState.phase === 'loading'}
        error={planState.phase === 'error' ? planState.error : undefined}
        plan={effectivePlan}
      />
    ) : null

  const installBlock =
    showInstallPanel ? (
      <InstallationResultPanel
        loading={installState.phase === 'loading'}
        error={installState.phase === 'error' ? installState.error : undefined}
        result={installState.result ?? system.installation}
      />
    ) : null

  const databaseBlock =
    showDatabasePanel ? (
      <SystemDatabasePanel
        loading={databaseState.phase === 'loading'}
        provisioning={databaseState.phase === 'provisioning'}
        error={databaseState.phase === 'error' ? databaseState.error : undefined}
        actionMessage={databaseState.actionMessage}
        planDatabase={planDatabase}
        host={databaseState.host ?? databaseState.analysis?.host}
        analysis={databaseState.analysis ?? system.databaseAnalysis}
        canProvision={system.status === 'instalado'}
        onProvision={(admin) => onProvisionDatabase(system.id, admin)}
      />
    ) : null

  const checklistCard =
    showServerChecklist && onChecklistAction ? (
      (() => {
        const status = checklistCardStatus({
          system,
          runtimeStatus,
          bootstrapLoading: serverBootstrapLoading,
          bootstrapStatus: serverBootstrapStatus,
        })
        return (
          <DashboardExpandableCard
            title="Checklist — servidor AcompSolemp"
            status={status.label}
            statusTone={status.tone}
            className="system-section-card"
          >
            <ServerOperationalChecklistPanel
              embedded
              system={system}
              runtimeStatus={runtimeStatus}
              bootstrapLoading={serverBootstrapLoading}
              bootstrapStatus={serverBootstrapStatus}
              onAction={onChecklistAction}
            />
          </DashboardExpandableCard>
        )
      })()
    ) : null

  const serviceBlock =
    isInstalled ? (
      <SystemServicePanel
        busyPhase={serviceState.phase}
        error={serviceState.phase === 'error' ? serviceState.error : undefined}
        message={serviceState.message}
        status={serviceState.status ?? system.serviceStatus}
        canManage
        onInstall={(automatic) => onInstallService(system.id, automatic)}
        onUninstall={() => onUninstallService(system.id)}
        onStart={() => onStartService(system.id)}
        onStop={() => onStopService(system.id)}
        onRestart={() => onRestartService(system.id)}
        onEnableAuto={() => onSetServiceAuto(system.id, true)}
        onDisableAuto={() => onSetServiceAuto(system.id, false)}
        onRefresh={() => onRefreshService(system.id)}
      />
    ) : null

  const cadastroSummary = systemStatusLabel[system.status]
  const cadastroTone: DashboardCardStatusTone =
    system.status === 'instalado'
      ? 'success'
      : system.status === 'erro_instalacao'
        ? 'error'
        : 'muted'

  const systemActions = (
    <div id="system-checklist-actions" className="system-actions">
        <button
          type="button"
          className="button button-primary button-small"
          disabled={analyzing || installState.phase === 'loading'}
          onClick={() => onAnalyze(system.id)}
        >
          {analyzing ? 'Analisando projeto...' : panelResult ? 'Analisar novamente' : 'Analisar'}
        </button>
        {canViewPlan ? (
          <button
            type="button"
            className="button button-secondary button-small"
            disabled={planState.phase === 'loading' || installState.phase === 'loading'}
            onClick={() => onRequestPlan(system.id)}
          >
            {planState.phase === 'loading' ? 'Gerando plano...' : 'Ver plano de instalação'}
          </button>
        ) : null}
        {canInstall && planIsManifest && onManifestAccessModeChange ? (
          <div className="manifest-access-choice">
            <p className="analysis-title">Modo de acesso</p>
            <p className="analysis-disclaimer">
              Escolha antes de instalar. Esta seleção vale só para o plano manifesto deste sistema.
            </p>
            <SystemAccessModeCards
              selected={manifestAccessMode}
              onSelect={onManifestAccessModeChange}
              localExample={`http://127.0.0.1:${effectivePlan?.identifiedPorts[0] ?? 8080}/login`}
              lanExample={`http://192.168.x.x:${effectivePlan?.identifiedPorts[0] ?? 8080}/login`}
            />
            {!manifestAccessMode ? (
              <p className="analysis-disclaimer">
                Selecione <strong>Local</strong> ou <strong>Rede local (LAN)</strong> para habilitar Instalar.
              </p>
            ) : null}
          </div>
        ) : null}
        {canInstall && planIsManifest && manifestAccessMode === 'lan' && onManifestOverlayInstallChange ? (
          <label className="manifest-overlay-option">
            <input
              type="checkbox"
              checked={manifestOverlayInstall ?? false}
              disabled={installState.phase === 'loading'}
              onChange={(event) => onManifestOverlayInstallChange(event.target.checked)}
            />
            Overlay WireGuard opcional (fase overlay.server; distinto da rede local)
          </label>
        ) : null}
        {canInstall && !serverEnvironmentReady ? (
          <p className="analysis-disclaimer system-actions-hint analysis-panel-error">
            Conclua a preparação do servidor no <strong>Dashboard</strong> (“Preparar este computador”) antes de
            instalar pelo manifesto.
          </p>
        ) : null}
        {installProgressHidden && onShowInstallProgress ? (
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={onShowInstallProgress}
          >
            Ver progresso da instalação
          </button>
        ) : null}
        {canInstall ? (
          <button
            type="button"
            className="button button-primary button-small"
            disabled={
              installState.phase === 'loading' ||
              planState.phase === 'loading' ||
              !serverEnvironmentReady ||
              (planIsManifest && !manifestAccessMode)
            }
            onClick={() => onInstall(system.id)}
          >
            {installState.phase === 'loading' ? 'Instalando...' : 'Instalar'}
          </button>
        ) : needsInstallationPlan ? (
          <button
            type="button"
            className="button button-primary button-small"
            disabled={planState.phase === 'loading'}
            onClick={() => onRequestPlan(system.id)}
          >
            {planState.phase === 'loading' ? 'Gerando plano...' : 'Preparar instalação'}
          </button>
        ) : null}
        {analysisIsMock && system.status === 'nao_instalado' && !analyzing ? (
          <p className="analysis-disclaimer system-actions-hint analysis-panel-error">
            Análise <strong>MOCK</strong> — o botão <strong>Instalar</strong> só aparece com análise{' '}
            <strong>REAL</strong> (serviço local na porta 47831). Reinicie o Manager e clique em{' '}
            <strong>Analisar</strong> de novo.
          </p>
        ) : null}
        {planState.phase === 'error' && system.status === 'nao_instalado' ? (
          <p className="analysis-disclaimer system-actions-hint analysis-panel-error">
            Plano de instalação: {planState.error}
          </p>
        ) : null}
        {acompUrlWithoutManifestBranch ? (
          <p className="analysis-disclaimer system-actions-hint">
            URL aponta para o repositório padrão (sem branch). Para AcompOPMS LAN (Caddy :8080), configure a URL com a
            branch que contém <code>server-manifest.json</code>, por exemplo{' '}
            <code>.../tree/cursor/servidor-lan-etapa16-bcc8</code>, depois <strong>Analisar</strong> novamente.
          </p>
        ) : null}
        {!canViewPlan && system.status === 'nao_instalado' && !analyzing && !analysisIsMock ? (
          <p className="analysis-disclaimer system-actions-hint">
            Use <strong>Analisar</strong> para habilitar o plano e o botão <strong>Instalar</strong> (requer o
            serviço local do Manager em execução).
          </p>
        ) : null}
        {isInstalled && !canInstall ? (
          <p className="analysis-disclaimer system-actions-hint">
            Este sistema já está <strong>instalado</strong> no disco — use <strong>Iniciar</strong> /{' '}
            <strong>Parar</strong>. O botão <strong>Instalar</strong> só aparece para cadastros ainda não instalados.
          </p>
        ) : null}
        {isInstalled ? (
          <>
            <button
              type="button"
              className={`button button-primary button-small${runtimeState.phase === 'loading' ? ' is-busy' : ''}`}
              disabled={!canStart || runtimeState.phase === 'loading'}
              title={startDisabledReason}
              aria-label={startDisabledReason ? `Iniciar indisponível: ${startDisabledReason}` : 'Iniciar sistema'}
              onClick={() => onStart(system.id)}
            >
              Iniciar
            </button>
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={!canStop || runtimeState.phase === 'loading'}
              onClick={() => onStop(system.id)}
            >
              Parar
            </button>
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={!canRestart || runtimeState.phase === 'loading'}
              onClick={() => onRestart(system.id)}
            >
              Reiniciar
            </button>
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={runtimeState.phase === 'loading'}
              onClick={() => onRefreshRuntime(system.id)}
            >
              Atualizar status
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={analyzing || installState.phase === 'loading'}
          onClick={() => onConfigure(system.id)}
        >
          Configurar
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={analyzing || installState.phase === 'loading'}
          onClick={() => onRemove(system.id)}
        >
          Desinstalar
        </button>
      </div>
  )

  const execSection = (() => {
    const execStatus = runtimeCardStatus(runtimeStatus)
    return (
      <DashboardExpandableCard
        title="Execução e acesso"
        status={execStatus.label}
        statusTone={execStatus.tone}
        className="system-section-card"
      >
        <SystemAccessPanel
          systemName={system.name}
          runtimeStatus={runtimeStatus}
          onRefreshRuntime={() => onRefreshRuntime(system.id)}
        />
        <SystemRuntimePanel
          systemId={system.id}
          loading={runtimeState.phase === 'loading' || runtimeState.phase === 'refreshing'}
          error={runtimeState.phase === 'error' ? runtimeState.error : undefined}
          message={runtimeState.actionMessage}
          status={runtimeStatus}
          onRuntimeRefresh={() => onRefreshRuntime(system.id)}
        />
        {isManifestLan && onManifestBackup && onManifestUpdate ? (
          <SystemManifestMaintenancePanel
            busy={manifestMaintenanceState?.phase === 'loading'}
            error={manifestMaintenanceState?.error}
            message={manifestMaintenanceState?.message}
            onBackup={() => onManifestBackup(system.id)}
            onUpdate={(skip) => onManifestUpdate(system.id, skip)}
          />
        ) : null}
        {isManifestLan ? (
          <p className="analysis-disclaimer">
            Serviço Windows não se aplica ao perfil LAN (Caddy :8080). Use <strong>Iniciar</strong> na secção abaixo
            — não use preview Vite <code>:4173</code>.
          </p>
        ) : null}
      </DashboardExpandableCard>
    )
  })()

  const analysisSectionTitle = isInstalled ? 'Análise, plano e instalação' : 'Preparação e instalação'
  const analysisSectionStatus = panelResult
    ? isInstalled
      ? 'Com análise'
      : 'Análise disponível'
    : isInstalled
      ? 'Pendente'
      : 'Aguardando análise'

  const analysisSection = (
    <DashboardExpandableCard
      title={analysisSectionTitle}
      status={analysisSectionStatus}
      statusTone={panelResult ? 'normal' : 'muted'}
      className="system-section-card"
    >
      {analysisBlock}
      {planBlock}
      {installBlock}
      {!isInstalled ? databaseBlock : null}
      {systemActions}
    </DashboardExpandableCard>
  )

  return (
    <article className="system-card">
      <div className="systems-panels-stack">
        <DashboardExpandableCard
          title={system.name}
          status={cadastroSummary}
          statusTone={cadastroTone}
          className="system-section-card system-cadastro-card"
        >
          <p className="system-url">{displaySystemSource(system)}</p>
          <dl className="system-meta">
            <div>
              <dt>Status</dt>
              <dd>
                <span className="badge">{systemStatusLabel[system.status]}</span>
              </dd>
            </div>
            <div>
              <dt>Tecnologia</dt>
              <dd>{displayTechnology(system)}</dd>
            </div>
          </dl>
        </DashboardExpandableCard>

        {checklistCard}

        {isInstalled ? (
          <>
            {execSection}
            {serviceBlock && !isManifestLan ? (
              <DashboardExpandableCard
                title="Serviço Windows (iniciar com o PC)"
                status={serviceState.status?.installed ? 'Instalado' : 'Não instalado'}
                statusTone={serviceState.status?.installed ? 'success' : 'muted'}
                className="system-section-card"
              >
                {serviceBlock}
              </DashboardExpandableCard>
            ) : null}
            {databaseBlock ? (
              <DashboardExpandableCard
                title="Banco de dados"
                status={databaseState.analysis ? 'Analisado' : 'Pendente'}
                statusTone={databaseState.analysis ? 'normal' : 'muted'}
                className="system-section-card"
              >
                {databaseBlock}
              </DashboardExpandableCard>
            ) : null}
            {analysisSection}
          </>
        ) : (
          analysisSection
        )}
      </div>
    </article>
  )
}
