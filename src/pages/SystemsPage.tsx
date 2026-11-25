import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AddSystemModal } from '../components/AddSystemModal.tsx'
import { AddSystemTutorialModal } from '../components/AddSystemTutorialModal.tsx'
import { ChooseSystemAccessModeModal } from '../components/ChooseSystemAccessModeModal.tsx'
import { InstallationProgressModal } from '../components/InstallationProgressModal.tsx'
import { EditSystemModal } from '../components/EditSystemModal.tsx'
import { RemoveSystemModal } from '../components/RemoveSystemModal.tsx'
import { SystemCard } from '../components/SystemCard.tsx'
import { useInstallationPlan } from '../hooks/useInstallationPlan.ts'
import { useSystemAnalysis } from '../hooks/useSystemAnalysis.ts'
import { useSystemInstallation } from '../hooks/useSystemInstallation.ts'
import { useSystemDatabase } from '../hooks/useSystemDatabase.ts'
import { useManifestMaintenance } from '../hooks/useManifestMaintenance.ts'
import { useSystemRuntime } from '../hooks/useSystemRuntime.ts'
import { FixedLanPort8080ConflictModal } from '../components/FixedLanPort8080ConflictModal.tsx'
import { useSystemService } from '../hooks/useSystemService.ts'
import { useServerBootstrap } from '../hooks/useServerBootstrap.ts'
import { runChecklistAction } from '../utils/checklistNavigation.ts'
import { notifyRuntimeChanged } from '../utils/runtimeChangedEvent.ts'
import { analysisRequiresDocker } from '../utils/analysisRequiresDocker.ts'
import {
  DockerAnalyzeModal,
  type DockerAnalyzeModalMode,
} from '../components/DockerAnalyzeModal.tsx'
import { DockerInstallModal } from '../components/DockerInstallModal.tsx'
import type { ChecklistActionTarget } from '../utils/serverOperationalChecklist.ts'
import type { SystemDatabaseAnalysis } from '../types/database.ts'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'
import type { SystemServiceStatus } from '../types/systemService.ts'
import type { AddSystemSubmitInput } from '../components/AddSystemModal.tsx'
import { projectSourceFromSystem } from '../types/projectSource.ts'
import { createSystem, loadSystems, saveSystems } from '../storage/systemsStorage.ts'
import { normalizeUserSourceUrl } from '../utils/gitSourceUrl.ts'
import { getLocalServiceBaseUrl } from '../services/localServiceConfig.ts'
import { localManagerService } from '../services/index.ts'
import { TrashIcon } from '../components/Icons.tsx'
import { syncSystemsFromDisk } from '../storage/syncSystemsFromDisk.ts'
import type { InstallationPlan } from '../types/installationPlan.ts'
import type { ManagedSystem } from '../types/system.ts'
import type { SystemAccessMode } from '../types/systemAccessMode.ts'
import {
  listSharedDisplayNameGroups,
  listSharedSourceUrlGroups,
} from '../utils/coexistingInstallations.ts'
import {
  normalizeRuntimeStatusForUi,
  resolveUserFacingAccessDisplay,
} from '../utils/systemAccessPanelDisplay.ts'
import { shouldAutoStartInstalledRuntime } from '../utils/autoStartInstalledRuntime.ts'
import { systemRuntimeStateLabel } from '../types/systemRuntime.ts'
import { systemStatusLabel } from '../types/system.ts'
import { BundledOmpsNavPromo } from '../components/BundledOmpsNavPromo.tsx'

type SystemsPageProps = {
  /** Aba Sistemas visível (evita auto-start enquanto a view está montada porém oculta). */
  isActive?: boolean
  onOpenBundledOmpsSetup?: () => void
}

export function SystemsPage({ isActive = true, onOpenBundledOmpsSetup }: SystemsPageProps) {
  const { status: serverBootstrapStatus, loading: serverBootstrapLoading } = useServerBootstrap()
  const serverEnvironmentReady =
    !serverBootstrapLoading && serverBootstrapStatus?.readyForManifestInstall === true

  const [systems, setSystems] = useState<ManagedSystem[]>(() => loadSystems())
  const [selectedId, setSelectedId] = useState<string | null>(() => loadSystems()[0]?.id ?? null)
  const [modalOpen, setModalOpen] = useState(false)
  const [addFlowSystemId, setAddFlowSystemId] = useState<string | null>(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [editSystem, setEditSystem] = useState<ManagedSystem | null>(null)
  const [removeSystem, setRemoveSystem] = useState<ManagedSystem | null>(null)
  const [uninstallBusy, setUninstallBusy] = useState(false)
  const [uninstallError, setUninstallError] = useState<string | null>(null)
  const [manifestOverlayInstall, setManifestOverlayInstall] = useState(false)
  const [manifestAccessModeById, setManifestAccessModeById] = useState<
    Record<string, SystemAccessMode>
  >({})
  const [databaseNumberBySystemId, setDatabaseNumberBySystemId] = useState<
    Record<string, string>
  >({})
  const [pendingInstall, setPendingInstall] = useState<{
    systemId: string
    plan: InstallationPlan
    overlayEnabled?: boolean
  } | null>(null)
  const closeAddModal = useCallback(() => {
    setModalOpen(false)
    setAddFlowSystemId(null)
  }, [])

  const analysisBootstrap = useMemo(
    () => systems.map((system) => ({ systemId: system.id, result: system.analysis })),
    [systems],
  )
  const planBootstrap = useMemo(
    () => systems.map((system) => ({ systemId: system.id, plan: system.installationPlan })),
    [systems],
  )
  const installBootstrap = useMemo(
    () => systems.map((system) => ({ systemId: system.id, result: system.installation })),
    [systems],
  )
  const runtimeBootstrap = useMemo(
    () =>
      systems.map((system) => ({
        systemId: system.id,
        status: system.runtime ? normalizeRuntimeStatusForUi(system.runtime) : undefined,
      })),
    [systems],
  )
  const databaseBootstrap = useMemo(
    () =>
      systems.map((system) => ({
        systemId: system.id,
        planDatabase: system.installationPlan?.database,
        analysis: system.databaseAnalysis,
      })),
    [systems],
  )

  const { getState, analyze } = useSystemAnalysis(analysisBootstrap)
  const analyzeFlowBusyRef = useRef(false)
  const [dockerAnalyzeGate, setDockerAnalyzeGate] = useState<{
    open: boolean
    mode: DockerAnalyzeModalMode
    systemId: string
    progressMessage: string
    errorMessage: string | null
  } | null>(null)
  const { getState: getPlanState, requestPlan } = useInstallationPlan(planBootstrap)
  const { getState: getInstallState, getProgress, install, resumeInstallAfterDocker } =
    useSystemInstallation(installBootstrap)
  const [installProgressSession, setInstallProgressSession] = useState<{
    systemId: string
    systemName: string
  } | null>(null)
  const addFlowOwnsInstallProgress = useMemo(
    () =>
      modalOpen &&
      addFlowSystemId !== null &&
      installProgressSession?.systemId === addFlowSystemId,
    [modalOpen, addFlowSystemId, installProgressSession?.systemId],
  )
  const [installProgressDismissed, setInstallProgressDismissed] = useState(false)
  const [dockerInstallBusy, setDockerInstallBusy] = useState(false)
  const [dockerInstallDetail, setDockerInstallDetail] = useState<string | undefined>(undefined)
  const {
    getState: getRuntimeState,
    refreshStatus,
    start,
    stop,
    restart,
    dismissFixedLanPort8080Conflict,
  } = useSystemRuntime(runtimeBootstrap)
  const { getState: getManifestMaintenanceState, runBackup, runUpdate } = useManifestMaintenance()
  const { getState: getDatabaseState, refreshHost, analyzeInstalled, provision } =
    useSystemDatabase(databaseBootstrap)
  const serviceBootstrap = useMemo(
    () => systems.map((system) => ({ systemId: system.id, status: system.serviceStatus })),
    [systems],
  )
  const {
    getState: getServiceState,
    refresh: refreshService,
    install: installService,
    uninstall: uninstallService,
    start: startService,
    stop: stopService,
    restart: restartService,
    setAutomaticStartup,
  } = useSystemService(serviceBootstrap)

  useEffect(() => {
    void syncSystemsFromDisk().then((merged) => {
      setSystems(merged)
      setSelectedId((current) => {
        if (current && merged.some((item) => item.id === current)) return current
        return merged[0]?.id ?? null
      })
    })
  }, [])

  useEffect(() => {
    const baseUrl = getLocalServiceBaseUrl()
    void (async () => {
      try {
        const response = await fetch(`${baseUrl}/api/v1/systems/discovered`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) return
        const payload = (await response.json()) as {
          systems?: { systemId: string; databaseNumber?: string | null }[]
        }
        const next: Record<string, string> = {}
        for (const row of payload.systems ?? []) {
          if (row.databaseNumber) next[row.systemId] = row.databaseNumber
        }
        setDatabaseNumberBySystemId(next)
      } catch {
        // local-service offline
      }
    })()
  }, [systems])

  const sharedSourceUrlGroups = useMemo(
    () => listSharedSourceUrlGroups(systems),
    [systems],
  )
  const sharedDisplayNameGroups = useMemo(
    () => listSharedDisplayNameGroups(systems),
    [systems],
  )

  const selectedSystem = systems.find((item) => item.id === selectedId) ?? systems[0]

  const autoRuntimeStartAttemptedRef = useRef(new Set<string>())
  const databasePolledRef = useRef(false)
  const servicePolledRef = useRef(false)

  function persistDatabaseAnalysis(systemId: string, analysis: SystemDatabaseAnalysis | undefined) {
    if (!analysis) return
    setSystems((current) => {
      const nextSystems = current.map((item) =>
        item.id === systemId ? { ...item, databaseAnalysis: analysis } : item,
      )
      saveSystems(nextSystems)
      return nextSystems
    })
  }

  function persistServiceStatus(systemId: string, status: SystemServiceStatus | undefined) {
    if (!status) return
    setSystems((current) => {
      const nextSystems = current.map((item) =>
        item.id === systemId ? { ...item, serviceStatus: status } : item,
      )
      saveSystems(nextSystems)
      return nextSystems
    })
  }

  function persistRuntime(systemId: string, status: SystemRuntimeStatus | undefined) {
    if (!status) return
    const normalized = normalizeRuntimeStatusForUi(status)
    setSystems((current) => {
      const nextSystems = current.map((item) =>
        item.id === systemId ? { ...item, runtime: normalized } : item,
      )
      saveSystems(nextSystems)
      return nextSystems
    })
  }

  const ensureInstalledRuntimeRunning = useCallback(
    async (systemId: string, options?: { force?: boolean }) => {
      if (!serverEnvironmentReady) return

      const runtimeUi = getRuntimeState(systemId)
      if (runtimeUi.phase === 'loading') return

      if (!options?.force && autoRuntimeStartAttemptedRef.current.has(systemId)) return
      autoRuntimeStartAttemptedRef.current.add(systemId)

      const status = await refreshStatus(systemId)
      if (status) persistRuntime(systemId, status)

      if (!shouldAutoStartInstalledRuntime(status)) return

      const result = await start(systemId)
      if (result?.status) persistRuntime(systemId, result.status)
    },
    [getRuntimeState, refreshStatus, serverEnvironmentReady, start],
  )

  useEffect(() => {
    if (!isActive || !serverEnvironmentReady || !selectedId) return
    const selected = systems.find((s) => s.id === selectedId)
    if (selected?.status !== 'instalado') return
    void (async () => {
      const status = await refreshStatus(selectedId)
      if (status) persistRuntime(selectedId, status)
    })()
  }, [isActive, selectedId, serverEnvironmentReady, refreshStatus])

  useEffect(() => {
    if (!isActive) return
    if (!serverEnvironmentReady) return

    const installed = systems.filter((system) => system.status === 'instalado')
    if (installed.length === 0) return

    void (async () => {
      for (const system of installed) {
        await ensureInstalledRuntimeRunning(system.id)
      }
    })()
  }, [isActive, systems, serverEnvironmentReady, ensureInstalledRuntimeRunning])

  useEffect(() => {
    if (databasePolledRef.current) return
    databasePolledRef.current = true

    void (async () => {
      await refreshHost()
      for (const system of systems.filter((item) => item.status === 'instalado')) {
        const analysis = await analyzeInstalled(system.id)
        if (analysis) persistDatabaseAnalysis(system.id, analysis)
      }
    })()
  }, [systems, refreshHost, analyzeInstalled])

  useEffect(() => {
    if (servicePolledRef.current) return
    servicePolledRef.current = true

    void (async () => {
      for (const system of systems.filter((item) => item.status === 'instalado')) {
        try {
          const status = await refreshService(system.id)
          persistServiceStatus(system.id, status)
        } catch {
          // local-service may be offline
        }
      }
    })()
  }, [systems, refreshService])

  async function handleServiceAction(
    systemId: string,
    action:
      | { type: 'install'; automaticStartup: boolean }
      | { type: 'uninstall' }
      | { type: 'start' }
      | { type: 'stop' }
      | { type: 'restart' }
      | { type: 'auto'; enabled: boolean }
      | { type: 'refresh' },
  ) {
    if (action.type === 'refresh') {
      const status = await refreshService(systemId)
      persistServiceStatus(systemId, status)
      const runtime = await refreshStatus(systemId)
      if (runtime) persistRuntime(systemId, runtime)
      return
    }

    const result =
      action.type === 'install'
        ? await installService(systemId, action.automaticStartup)
        : action.type === 'uninstall'
          ? await uninstallService(systemId)
          : action.type === 'start'
            ? await startService(systemId)
            : action.type === 'stop'
              ? await stopService(systemId)
              : action.type === 'restart'
                ? await restartService(systemId)
                : await setAutomaticStartup(systemId, action.enabled)

    if (result.status) {
      persistServiceStatus(systemId, result.status)
    }
    const runtime = await refreshStatus(systemId)
    if (runtime) persistRuntime(systemId, runtime)
    if (action.type === 'start' || action.type === 'stop' || action.type === 'restart') {
      notifyRuntimeChanged()
    }
  }

  function handleRegisterAddFlowSystem(input: AddSystemSubmitInput): ManagedSystem {
    const created =
      input.sourceKind === 'localFolder'
        ? createSystem({
            name: input.name,
            sourceKind: 'localFolder',
            localFolderPath: input.localFolderPath,
          })
        : createSystem({ name: input.name, url: normalizeUserSourceUrl(input.url) })
    const nextSystems = [created, ...systems]
    setSystems(nextSystems)
    saveSystems(nextSystems)
    setAddFlowSystemId(created.id)
    setSelectedId(created.id)
    return created
  }

  function handleUpdateAddFlowSystemSource(systemId: string, input: AddSystemSubmitInput) {
    const nextSystems = systems.map((item) => {
      if (item.id !== systemId) return item
      if (input.sourceKind === 'localFolder') {
        return {
          ...item,
          name: input.name.trim(),
          url: '',
          sourceKind: 'localFolder' as const,
          localFolderPath: input.localFolderPath,
          technology: 'aguardando_analise' as const,
          analysis: undefined,
          installationPlan: undefined,
          installation: undefined,
          status: 'nao_instalado' as const,
        }
      }
      const urlChanged = normalizeUserSourceUrl(input.url) !== item.url.trim()
      return {
        ...item,
        name: input.name.trim(),
        url: normalizeUserSourceUrl(input.url),
        sourceKind: undefined,
        localFolderPath: undefined,
        ...(urlChanged
          ? {
              technology: 'aguardando_analise' as const,
              analysis: undefined,
              installationPlan: undefined,
              installation: undefined,
              status: 'nao_instalado' as const,
            }
          : {}),
      }
    })
    setSystems(nextSystems)
    saveSystems(nextSystems)
  }

  async function handleAddFlowAnalyze(systemId: string, input: AddSystemSubmitInput) {
    const source =
      input.sourceKind === 'localFolder'
        ? { kind: 'localFolder' as const, localFolderPath: input.localFolderPath }
        : { kind: 'git' as const, sourceUrl: input.url }
    await completeAnalyzeFlow(systemId, source)
  }

  async function handleAddFlowInstall(
    systemId: string,
    accessMode: SystemAccessMode,
    overlayEnabled?: boolean,
  ) {
    const system = systems.find((item) => item.id === systemId)
    if (!system) return
    let plan: InstallationPlan | undefined = system.installationPlan ?? getPlanState(systemId).plan
    if (!plan) return
    beginInstallProgressSession(systemId, system.name)
    const result = await install(systemId, projectSourceFromSystem(system), plan, {
      accessMode,
      overlayEnabled,
    })
    await finalizeInstallOutcome(systemId, result)
  }

  function handleAddFlowFinished(systemId: string) {
    setSelectedId(systemId)
    setInstallProgressSession(null)
    closeAddModal()
  }

  function handleConfigureSave(systemId: string, input: { name: string; url: string }) {
    const current = systems.find((item) => item.id === systemId)
    if (!current) return

    const urlChanged = input.url.trim() !== current.url.trim()
    const resetAnalysis = urlChanged && current.status !== 'instalado'

    const nextSystems = systems.map((item) =>
      item.id === systemId
        ? {
            ...item,
            name: input.name.trim(),
            url: normalizeUserSourceUrl(input.url),
            ...(resetAnalysis
              ? {
                  technology: 'aguardando_analise' as const,
                  analysis: undefined,
                  installationPlan: undefined,
                  installation: undefined,
                  status: 'nao_instalado' as const,
                  runtime: undefined,
                  databaseAnalysis: undefined,
                  serviceStatus: undefined,
                }
              : {}),
          }
        : item,
    )
    setSystems(nextSystems)
    saveSystems(nextSystems)
    setEditSystem(null)
  }

  function removeSystemFromCatalog(systemId: string) {
    const nextSystems = systems.filter((item) => item.id !== systemId)
    setSystems(nextSystems)
    saveSystems(nextSystems)
    setSelectedId((current) => {
      if (current !== systemId) return current
      return nextSystems[0]?.id ?? null
    })
    autoRuntimeStartAttemptedRef.current.delete(systemId)
  }

  async function handleRemoveConfirm(systemId: string) {
    setUninstallBusy(true)
    setUninstallError(null)
    try {
      const result = await localManagerService.uninstallSystem(systemId)
      if (!result.ok) {
        setUninstallError(result.message)
        return
      }
      removeSystemFromCatalog(systemId)
      setRemoveSystem(null)
    } catch (error) {
      setUninstallError(error instanceof Error ? error.message : String(error))
    } finally {
      setUninstallBusy(false)
    }
  }

  async function ensureDockerBeforeAnalyze(system: ManagedSystem): Promise<boolean> {
    if (!analysisRequiresDocker(system.analysis)) return true

    setDockerAnalyzeGate({
      open: true,
      mode: 'preparing',
      systemId: system.id,
      progressMessage: 'Verificando Docker…',
      errorMessage: null,
    })

    const poll = window.setInterval(() => {
      void localManagerService.getDockerStatus().then((response) => {
        setDockerAnalyzeGate((current) =>
          current && current.systemId === system.id && current.mode === 'preparing'
            ? { ...current, progressMessage: response.state.detail }
            : current,
        )
      }).catch(() => {
        /* status opcional durante preparação */
      })
    }, 2_000)

    try {
      const ensured = await localManagerService.ensureDockerDesktop()
      if (ensured.ok) {
        setDockerAnalyzeGate(null)
        return true
      }
      setDockerAnalyzeGate({
        open: true,
        mode: ensured.code === 'not_installed' ? 'missing' : 'failed',
        systemId: system.id,
        progressMessage: ensured.state.detail,
        errorMessage: ensured.message,
      })
      return false
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setDockerAnalyzeGate({
        open: true,
        mode: 'failed',
        systemId: system.id,
        progressMessage: '',
        errorMessage: message,
      })
      return false
    } finally {
      window.clearInterval(poll)
    }
  }

  async function completeAnalyzeFlow(systemId: string, source: ReturnType<typeof projectSourceFromSystem>) {
    const result = await analyze(systemId, source)
    if (!result) return

    const plan = await requestPlan(systemId, source, result)

    setSystems((current) => {
      const nextSystems = current.map((item) =>
        item.id === systemId
          ? {
              ...item,
              technology: 'analisada' as const,
              analysis: result,
              installationPlan: plan ?? undefined,
              installation: item.status === 'instalado' ? item.installation : undefined,
              status: item.status === 'instalado' ? item.status : ('nao_instalado' as const),
            }
          : item,
      )
      saveSystems(nextSystems)
      return nextSystems
    })
  }

  async function handleAnalyze(systemId: string) {
    if (analyzeFlowBusyRef.current) return
    const system = systems.find((item) => item.id === systemId)
    if (!system) return

    analyzeFlowBusyRef.current = true
    try {
      const dockerOk = await ensureDockerBeforeAnalyze(system)
      if (!dockerOk) return
      await completeAnalyzeFlow(systemId, projectSourceFromSystem(system))
    } finally {
      analyzeFlowBusyRef.current = false
    }
  }

  async function handleRequestPlan(systemId: string) {
    const system = systems.find((item) => item.id === systemId)
    if (!system) return

    const plan = await requestPlan(systemId, projectSourceFromSystem(system), system.analysis)
    if (!plan) return

    const nextSystems = systems.map((item) =>
      item.id === systemId ? { ...item, installationPlan: plan } : item,
    )
    setSystems(nextSystems)
    saveSystems(nextSystems)
  }

  function beginInstallProgressSession(systemId: string, systemName: string) {
    setInstallProgressSession({ systemId, systemName })
    setInstallProgressDismissed(false)
  }

  async function finalizeInstallOutcome(systemId: string, result: Awaited<ReturnType<typeof install>>) {
    const installState = getInstallState(systemId)
    const persistedResult = result ?? installState.result

    if (installState.phase === 'awaiting_docker') return

    if (!persistedResult) return

    const nextSystems = systems.map((item) =>
      item.id === systemId
        ? {
            ...item,
            status: persistedResult.ok ? ('instalado' as const) : ('erro_instalacao' as const),
            installation: persistedResult,
          }
        : item,
    )
    setSystems(nextSystems)
    saveSystems(nextSystems)

    if (persistedResult.ok) {
      autoRuntimeStartAttemptedRef.current.delete(systemId)
      await ensureInstalledRuntimeRunning(systemId, { force: true })
      const dbAnalysis = await analyzeInstalled(systemId)
      if (dbAnalysis) persistDatabaseAnalysis(systemId, dbAnalysis)
    }
  }

  async function runInstallWithAccessMode(
    systemId: string,
    accessMode: SystemAccessMode,
    plan: InstallationPlan,
    overlayEnabled?: boolean,
  ) {
    const system = systems.find((item) => item.id === systemId)
    if (!system) return

    beginInstallProgressSession(systemId, system.name)

    const result = await install(systemId, projectSourceFromSystem(system), plan, {
      accessMode,
      overlayEnabled,
    })
    await finalizeInstallOutcome(systemId, result)
  }

  async function handleDockerInstallOpen() {
    if (!installProgressSession) return
    setDockerInstallBusy(true)
    try {
      const launched = await localManagerService.launchDockerDesktop()
      setDockerInstallDetail(launched.message)
    } catch (error) {
      setDockerInstallDetail(error instanceof Error ? error.message : String(error))
    } finally {
      setDockerInstallBusy(false)
    }
  }

  async function handleDockerInstallVerifyAgain() {
    if (!installProgressSession) return
    const { systemId } = installProgressSession
    setDockerInstallBusy(true)
    try {
      const status = await localManagerService.getDockerStatus()
      setDockerInstallDetail(status.state.detail)
      if (!status.state.running) return

      const system = systems.find((item) => item.id === systemId)
      if (!system) return

      const result = await resumeInstallAfterDocker(systemId)
      await finalizeInstallOutcome(systemId, result)
    } catch (error) {
      setDockerInstallDetail(error instanceof Error ? error.message : String(error))
    } finally {
      setDockerInstallBusy(false)
    }
  }

  async function handleInstall(systemId: string) {
    const system = systems.find((item) => item.id === systemId)
    if (!system) return

    let plan: InstallationPlan | undefined = system.installationPlan ?? getPlanState(systemId).plan
    if (!plan) {
      const analysis = system.analysis ?? getState(systemId).result
      if (!analysis) return
      const fetched = await requestPlan(systemId, projectSourceFromSystem(system), analysis)
      if (!fetched) return
      plan = fetched
      setSystems((current) => {
        const next = current.map((item) =>
          item.id === systemId ? { ...item, installationPlan: fetched } : item,
        )
        saveSystems(next)
        return next
      })
    }

    const isManifestPlan = plan.packageManager === 'manifest'
    if (isManifestPlan) {
      const accessMode = manifestAccessModeById[systemId]
      if (!accessMode) return
      void runInstallWithAccessMode(
        systemId,
        accessMode,
        plan,
        accessMode === 'local' ? manifestOverlayInstall : false,
      )
      return
    }

    setPendingInstall({
      systemId,
      plan,
    })
  }

  function handleAccessModeConfirm(mode: SystemAccessMode) {
    if (!pendingInstall) return
    const { systemId, plan, overlayEnabled } = pendingInstall
    setPendingInstall(null)
    void runInstallWithAccessMode(systemId, mode, plan, overlayEnabled)
  }

  async function handleProvisionDatabase(
    systemId: string,
    admin: import('../types/database.ts').PostgresAdminCredentialsInput,
  ) {
    const response = await provision(systemId, admin)
    if (response.analysis) {
      persistDatabaseAnalysis(systemId, response.analysis)
    }
  }

  function handleChecklistAction(systemId: string, target: ChecklistActionTarget) {
    runChecklistAction(target, {
      onRefreshRuntime: () => void handleRuntimeAction(systemId, 'refresh'),
    })
  }

  async function handleRuntimeAction(
    systemId: string,
    action: 'start' | 'stop' | 'restart' | 'refresh',
  ) {
    const result =
      action === 'start'
        ? await start(systemId)
        : action === 'stop'
          ? await stop(systemId)
          : action === 'restart'
            ? await restart(systemId)
            : null

    if (action === 'refresh') {
      const status = await refreshStatus(systemId)
      if (status) persistRuntime(systemId, status)
      return
    }

    if (result?.status) {
      persistRuntime(systemId, result.status)
    }
  }

  const selectedRuntimeRaw = selectedSystem
    ? getRuntimeState(selectedSystem.id).status ?? selectedSystem.runtime
    : null
  const selectedRuntimeForToolbar = selectedRuntimeRaw
    ? normalizeRuntimeStatusForUi(selectedRuntimeRaw)
    : null
  const selectedRuntimeUi = selectedSystem ? getRuntimeState(selectedSystem.id) : null
  const userAccessDisplay =
    selectedSystem?.status === 'instalado'
      ? resolveUserFacingAccessDisplay(selectedRuntimeForToolbar)
      : null
  const runtimeBusy =
    selectedRuntimeUi?.phase === 'loading' ||
    selectedRuntimeForToolbar?.state === 'iniciando' ||
    selectedRuntimeForToolbar?.state === 'encerrando'
  const canQuickStart =
    Boolean(selectedSystem?.status === 'instalado') &&
    !runtimeBusy &&
    userAccessDisplay?.url &&
    !userAccessDisplay.active
  const selectedDatabaseNumber = selectedSystem
    ? (databaseNumberBySystemId[selectedSystem.id] ?? null)
    : null

  const port8080ConflictSystemId =
    systems.find((system) => getRuntimeState(system.id).fixedLanPort8080ConflictOpen)?.id ?? null

  return (
    <>
      {port8080ConflictSystemId ? (
        <FixedLanPort8080ConflictModal
          open
          systemId={port8080ConflictSystemId}
          busy={getRuntimeState(port8080ConflictSystemId).phase === 'loading'}
          onClose={() => dismissFixedLanPort8080Conflict(port8080ConflictSystemId)}
          onReleased={() => {
            dismissFixedLanPort8080Conflict(port8080ConflictSystemId)
            void handleRuntimeAction(port8080ConflictSystemId, 'start')
          }}
        />
      ) : null}

    <section className="page page-systems page-systems-host">
      <div className="systems-page-toolbar">
        <button
          type="button"
          className="button button-secondary systems-page-toolbar-tutorial"
          onClick={() => setTutorialOpen(true)}
        >
          Tutorial
        </button>
        <div className="systems-page-toolbar-access">
          {selectedSystem?.status === 'instalado' && userAccessDisplay ? (
            userAccessDisplay.url ? (
              <>
                <div className="systems-toolbar-access-head">
                  <span className="systems-toolbar-access-label">Acesso para usuários</span>
                  <span
                    className={`badge ${userAccessDisplay.active ? 'badge-real' : 'badge-plan'}`}
                  >
                    {userAccessDisplay.statusLabel}
                  </span>
                </div>
                <div className="systems-toolbar-access-url-row">
                  {selectedDatabaseNumber ? (
                    <span
                      className="database-number-badge systems-toolbar-database-badge"
                      title="Número do banco de dados deste sistema"
                    >
                      {selectedDatabaseNumber}
                    </span>
                  ) : null}
                  {userAccessDisplay.active ? (
                    <a
                      className="systems-toolbar-access-url"
                      href={userAccessDisplay.url}
                      target="_blank"
                      rel="noreferrer"
                      title={userAccessDisplay.url}
                    >
                      {userAccessDisplay.url}
                    </a>
                  ) : (
                    <span
                      className="systems-toolbar-access-url is-inactive"
                      title={userAccessDisplay.url}
                    >
                      {userAccessDisplay.url}
                    </span>
                  )}
                </div>
                {userAccessDisplay.hint ? (
                  <p className="systems-toolbar-access-muted">{userAccessDisplay.hint}</p>
                ) : null}
                {canQuickStart && selectedSystem ? (
                  <button
                    type="button"
                    className={`button button-primary button-small systems-toolbar-start-button${selectedRuntimeUi?.phase === 'loading' ? ' is-busy' : ''}`}
                    disabled={
                      selectedRuntimeUi?.phase === 'loading' ||
                      !serverEnvironmentReady ||
                      runtimeBusy
                    }
                    title={
                      !serverEnvironmentReady
                        ? 'Preparar o PC no Dashboard antes de iniciar.'
                        : runtimeBusy
                          ? 'Aguarde a operação em andamento.'
                          : undefined
                    }
                    onClick={() => void handleRuntimeAction(selectedSystem.id, 'start')}
                  >
                    Iniciar agora
                  </button>
                ) : null}
              </>
            ) : (
              <p className="systems-toolbar-access-muted">{userAccessDisplay.hint}</p>
            )
          ) : null}
        </div>
        <button
          type="button"
          className="button button-primary systems-page-toolbar-add"
          onClick={() => setModalOpen(true)}
        >
          + Adicionar sistema
        </button>
      </div>

      <AddSystemTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      {!serverBootstrapLoading && !serverEnvironmentReady ? (
        <div className="systems-notice" role="status">
          <strong>Preparação do servidor pendente.</strong> Abra o <strong>Dashboard</strong>, revise as dependências e
          use <strong>Preparar este computador</strong> antes de instalar o AcompSolemp pelo manifesto.
        </div>
      ) : null}

      {sharedSourceUrlGroups.length > 0 ? (
        <div className="systems-notice" role="status">
          <strong>Vários sistemas usam o mesmo repositório Git.</strong> Isso é permitido: cada cadastro
          recebe um <code>systemId</code> (UUID) próprio, diretório isolado em{' '}
          <code>ServidorManager/systems</code>, identidade Supabase dedicada (<code>sm*</code>) e porta HTTP
          LAN ajustada automaticamente quando <code>8080</code> já estiver em uso (sem encerrar Caddy de
          outra instalação). Instalações existentes não são alteradas.
          <ul className="systems-dedupe-list">
            {sharedSourceUrlGroups.map((group) => (
              <li key={group[0]?.url ?? group[0]?.id}>
                <span className="systems-dedupe-url">{group[0]?.url}</span>
                <ul>
                  {group.map((system) => {
                    const runtime = getRuntimeState(system.id).status ?? system.runtime
                    const manifest =
                      system.installationPlan?.packageManager === 'manifest' ||
                      runtime?.runtimeKind === 'manifest-lan'
                    const httpPort =
                      typeof runtime?.port === 'number' && runtime.port > 0 ? runtime.port : null
                    return (
                      <li key={system.id}>
                        <button type="button" className="link-button" onClick={() => setSelectedId(system.id)}>
                          {system.name} ({system.id.slice(0, 8)}…)
                        </button>
                        {manifest ? <span className="badge">manifest LAN</span> : <span className="badge">legado</span>}
                        {httpPort ? <span className="badge">HTTP :{httpPort}</span> : null}
                        {runtime?.loginUrl ? (
                          <span className="systems-list-login" title={runtime.loginUrl}>
                            login
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sharedDisplayNameGroups.length > 0 ? (
        <div className="systems-notice systems-notice-muted" role="status">
          <strong>Nomes iguais em sistemas diferentes.</strong> O Manager identifica cada instalação pelo{' '}
          <code>systemId</code>, não pelo nome. Use nomes distintos na lista para evitar confusão (nenhuma
          instalação é removida automaticamente).
          <ul className="systems-dedupe-list">
            {sharedDisplayNameGroups.map((group) => (
              <li key={group[0]?.name}>
                {group.map((system) => (
                  <span key={system.id}>
                    {system.name} <code>{system.id.slice(0, 8)}…</code>
                    {group.indexOf(system) < group.length - 1 ? ' · ' : null}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {systems.length === 0 ? (
        <div className="empty-state">
          {onOpenBundledOmpsSetup ? (
            <BundledOmpsNavPromo onOpenSetup={onOpenBundledOmpsSetup} variant="card" />
          ) : null}
          <h2>Nenhum sistema cadastrado</h2>
          <p>Cadastre o nome e a URL de um sistema para acompanhá-lo nesta lista.</p>
          <button type="button" className="button button-primary" onClick={() => setModalOpen(true)}>
            Adicionar primeiro sistema
          </button>
        </div>
      ) : (
        <div className="systems-host-body">
          <div className="systems-shell">
            <nav className="systems-list" aria-label="Catálogo de sistemas">
              {systems.map((system) => {
                const runtime = getRuntimeState(system.id).status ?? system.runtime
                const running = runtime?.state === 'executando'
                const selected = system.id === selectedSystem?.id
                return (
                  <div
                    key={system.id}
                    className={`systems-list-row${selected ? ' selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="systems-list-item"
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => setSelectedId(system.id)}
                    >
                      <span className="systems-list-item-title">{system.name}</span>
                      <span className="systems-list-item-meta">
                        <span className="badge">{systemStatusLabel[system.status]}</span>
                        {running ? (
                          <span className="systems-list-running">
                            <span className="status-dot" /> {systemRuntimeStateLabel.executando}
                          </span>
                        ) : null}
                        {runtime?.loginUrl ? (
                          <span className="systems-list-login" title={runtime.loginUrl}>
                            Login LAN
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="systems-list-uninstall"
                      aria-label={`Desinstalar ${system.name}`}
                      title="Desinstalar sistema"
                      onClick={() => {
                        setUninstallError(null)
                        setRemoveSystem(system)
                      }}
                    >
                      <TrashIcon width={16} height={16} aria-hidden />
                    </button>
                  </div>
                )
              })}
            </nav>
            <div className="systems-detail">
              {selectedSystem ? (
                <SystemCard
                key={selectedSystem.id}
                system={selectedSystem}
                analysisState={getState(selectedSystem.id)}
                planState={getPlanState(selectedSystem.id)}
                installState={getInstallState(selectedSystem.id)}
                runtimeState={getRuntimeState(selectedSystem.id)}
                manifestMaintenanceState={getManifestMaintenanceState(selectedSystem.id)}
                manifestOverlayInstall={manifestOverlayInstall}
                onManifestOverlayInstallChange={setManifestOverlayInstall}
                manifestAccessMode={manifestAccessModeById[selectedSystem.id] ?? null}
                onManifestAccessModeChange={(mode) =>
                  setManifestAccessModeById((current) => ({ ...current, [selectedSystem.id]: mode }))
                }
                onManifestBackup={(id) => void runBackup(id)}
                onManifestUpdate={(id, skip) =>
                  void (async () => {
                    const result = await runUpdate(id, skip)
                    if (result.ok) {
                      autoRuntimeStartAttemptedRef.current.delete(id)
                      await ensureInstalledRuntimeRunning(id, { force: true })
                    }
                  })()
                }
                databaseState={getDatabaseState(selectedSystem.id)}
                onAnalyze={handleAnalyze}
                onRequestPlan={handleRequestPlan}
                onInstall={handleInstall}
                installProgressHidden={
                  installProgressSession?.systemId === selectedSystem.id &&
                  installProgressDismissed &&
                  getInstallState(selectedSystem.id).phase === 'loading'
                }
                onShowInstallProgress={() => setInstallProgressDismissed(false)}
                serverEnvironmentReady={serverEnvironmentReady}
                serverBootstrapLoading={serverBootstrapLoading}
                serverBootstrapStatus={serverBootstrapStatus}
                onChecklistAction={(target) => handleChecklistAction(selectedSystem.id, target)}
                dockerPrepareActive={
                  dockerAnalyzeGate?.open === true &&
                  dockerAnalyzeGate.systemId === selectedSystem.id &&
                  dockerAnalyzeGate.mode === 'preparing'
                }
                onStart={(id) => void handleRuntimeAction(id, 'start')}
                onStop={(id) => void handleRuntimeAction(id, 'stop')}
                onRestart={(id) => void handleRuntimeAction(id, 'restart')}
                onRefreshRuntime={(id) => void handleRuntimeAction(id, 'refresh')}
                onProvisionDatabase={(id, admin) => void handleProvisionDatabase(id, admin)}
                serviceState={getServiceState(selectedSystem.id)}
                onInstallService={(id, automatic) =>
                  void handleServiceAction(id, { type: 'install', automaticStartup: automatic })
                }
                onUninstallService={(id) => void handleServiceAction(id, { type: 'uninstall' })}
                onStartService={(id) => void handleServiceAction(id, { type: 'start' })}
                onStopService={(id) => void handleServiceAction(id, { type: 'stop' })}
                onRestartService={(id) => void handleServiceAction(id, { type: 'restart' })}
                onSetServiceAuto={(id, enabled) => void handleServiceAction(id, { type: 'auto', enabled })}
                onRefreshService={(id) => void handleServiceAction(id, { type: 'refresh' })}
                onConfigure={(id) => {
                  const target = systems.find((item) => item.id === id)
                  if (target) setEditSystem(target)
                }}
                onRemove={(id) => {
                  const target = systems.find((item) => item.id === id)
                  if (target) {
                    setUninstallError(null)
                    setRemoveSystem(target)
                  }
                }}
              />
              ) : null}
            </div>
          </div>
        </div>
      )}

      <DockerInstallModal
        open={
          !addFlowOwnsInstallProgress &&
          installProgressSession !== null &&
          (getInstallState(installProgressSession.systemId).phase === 'awaiting_docker' ||
            getProgress(installProgressSession.systemId)?.status === 'awaiting_docker')
        }
        busy={dockerInstallBusy}
        statusDetail={dockerInstallDetail}
        onOpenDocker={() => void handleDockerInstallOpen()}
        onVerifyAgain={() => void handleDockerInstallVerifyAgain()}
      />

      <InstallationProgressModal
        open={
          !addFlowOwnsInstallProgress &&
          installProgressSession !== null &&
          (!installProgressDismissed ||
            getInstallState(installProgressSession.systemId).phase === 'success' ||
            getInstallState(installProgressSession.systemId).phase === 'error' ||
            getInstallState(installProgressSession.systemId).phase === 'awaiting_docker')
        }
        systemName={installProgressSession?.systemName ?? 'Sistema'}
        installState={
          installProgressSession
            ? getInstallState(installProgressSession.systemId)
            : { phase: 'idle' }
        }
        progress={
          installProgressSession ? (getProgress(installProgressSession.systemId) ?? null) : null
        }
        onDismiss={() => {
          if (!installProgressSession) return
          const phase = getInstallState(installProgressSession.systemId).phase
          if (phase === 'loading') {
            setInstallProgressDismissed(true)
            return
          }
          setInstallProgressSession(null)
        }}
      />

      <ChooseSystemAccessModeModal
        open={pendingInstall !== null}
        systemName={
          pendingInstall
            ? (systems.find((item) => item.id === pendingInstall.systemId)?.name ?? 'Sistema')
            : ''
        }
        onClose={() => setPendingInstall(null)}
        onConfirm={handleAccessModeConfirm}
      />
      <AddSystemModal
        open={modalOpen}
        onClose={closeAddModal}
        onFinished={handleAddFlowFinished}
        flowSystemId={addFlowSystemId}
        onRegisterSystem={handleRegisterAddFlowSystem}
        onUpdateSystemSource={handleUpdateAddFlowSystemSource}
        getAnalysisState={getState}
        getPlanState={getPlanState}
        getInstallState={getInstallState}
        getProgress={getProgress}
        onRunAnalyze={handleAddFlowAnalyze}
        onRunInstall={handleAddFlowInstall}
        onResumeDockerInstall={async (systemId) => {
          const result = await resumeInstallAfterDocker(systemId)
          await finalizeInstallOutcome(systemId, result)
        }}
        onLaunchDocker={() => void handleDockerInstallOpen()}
        dockerInstallBusy={dockerInstallBusy}
        dockerInstallDetail={dockerInstallDetail}
        serverEnvironmentReady={serverEnvironmentReady}
      />
      <EditSystemModal
        open={Boolean(editSystem)}
        system={editSystem}
        onClose={() => setEditSystem(null)}
        onSubmit={handleConfigureSave}
      />
      <DockerAnalyzeModal
        open={dockerAnalyzeGate?.open === true}
        mode={dockerAnalyzeGate?.mode ?? 'preparing'}
        progressMessage={dockerAnalyzeGate?.progressMessage ?? ''}
        errorMessage={dockerAnalyzeGate?.errorMessage}
        busy={dockerAnalyzeGate?.mode === 'preparing'}
        onClose={() => {
          if (dockerAnalyzeGate?.mode === 'preparing') return
          setDockerAnalyzeGate(null)
        }}
        onRetry={
          dockerAnalyzeGate
            ? () => {
                setDockerAnalyzeGate(null)
                void handleAnalyze(dockerAnalyzeGate.systemId)
              }
            : undefined
        }
        onOpenBootstrap={() => {
          runChecklistAction('dashboard_bootstrap')
          setDockerAnalyzeGate(null)
        }}
      />

      <RemoveSystemModal
        open={Boolean(removeSystem)}
        system={removeSystem}
        busy={uninstallBusy}
        errorMessage={uninstallError}
        onClose={() => {
          if (uninstallBusy) return
          setRemoveSystem(null)
          setUninstallError(null)
        }}
        onConfirm={(id) => void handleRemoveConfirm(id)}
      />
    </section>
    </>
  )
}
