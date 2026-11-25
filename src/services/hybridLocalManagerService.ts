import type {
  CpuMetrics,
  MemoryMetrics,
  ServerInfo,
  ServerStatus,
  StorageMetrics,
} from '../types/managerService.ts'
import type { PostgresAdminCredentialsInput } from '../types/database.ts'
import type { InstallationPlan } from '../types/installationPlan.ts'
import type { SystemAnalysisResult } from '../types/systemAnalysis.ts'
import type { HttpLocalManagerClient } from './httpLocalManagerClient.ts'
import type { LocalManagerService } from './localManagerService.ts'
import type { MockLocalManagerService } from './mockLocalManagerService.ts'
import { formatLocalServiceCommunicationError } from './localServiceReachability.ts'
import { isPackagedBundledOmpsProduct } from '../utils/packagedBundledOmps.ts'

/** Mock só no Vite dev; no app empacotado falhas de rede devem aparecer como erro, não como análise MOCK. */
function allowMockApiFallback(): boolean {
  return import.meta.env.DEV
}

function memoryUsagePercent(info: ServerInfo): number {
  if (info.memoryTotalBytes <= 0) return 0
  const used = info.memoryTotalBytes - info.memoryFreeBytes
  return Math.max(0, Math.min(100, Math.round((used / info.memoryTotalBytes) * 100)))
}

function storageUsagePercent(info: ServerInfo): number {
  if (info.storageTotalBytes <= 0) return 0
  const used = info.storageTotalBytes - info.storageAvailableBytes
  return Math.max(0, Math.min(100, Math.round((used / info.storageTotalBytes) * 100)))
}

function metricsFromServerInfo(info: ServerInfo) {
  const memoryPercent = memoryUsagePercent(info)
  const storagePercent = storageUsagePercent(info)

  const status: ServerStatus = {
    health: 'operational',
    label: 'Operacional',
    detail: `${info.computerName} · ${info.operatingSystem}`,
  }

  const cpu: CpuMetrics = {
    displayValue: String(info.cpuCount),
    detail: `${info.cpuCount} processadores lógicos`,
  }

  const memory: MemoryMetrics = {
    usagePercent: memoryPercent,
    detail: `${info.memoryFreeLabel} livres de ${info.memoryTotalLabel}`,
  }

  const storage: StorageMetrics = {
    usagePercent: storagePercent,
    usedLabel: info.storageAvailableLabel,
    totalLabel: info.storageTotalLabel,
    detail: `${info.storageAvailableLabel} disponíveis em ${info.storagePath} (${info.storageTotalLabel})`,
  }

  return { status, cpu, memory, storage }
}

export class HybridLocalManagerService implements LocalManagerService {
  private inFlightServerInfo: Promise<ServerInfo | null> | undefined
  private readonly remote: HttpLocalManagerClient
  private readonly fallback: MockLocalManagerService

  constructor(remote: HttpLocalManagerClient, fallback: MockLocalManagerService) {
    this.remote = remote
    this.fallback = fallback
  }

  private resolveServerInfo(): Promise<ServerInfo | null> {
    this.inFlightServerInfo ??= this.remote
      .getServerInfo()
      .catch(() => null)
      .finally(() => {
        this.inFlightServerInfo = undefined
      })

    return this.inFlightServerInfo
  }

  async getServerInfo(): Promise<ServerInfo> {
    const remote = await this.resolveServerInfo()
    if (remote) return remote
    return this.fallback.getServerInfo()
  }

  async getServerStatus(): Promise<ServerStatus> {
    const info = await this.resolveServerInfo()
    if (info) return metricsFromServerInfo(info).status
    return this.fallback.getServerStatus()
  }

  async getCpuMetrics(): Promise<CpuMetrics> {
    try {
      const live = await this.remote.getMonitoringLive()
      if (live.cpuUsagePercent != null) {
        return {
          displayValue: `${Math.round(live.cpuUsagePercent)}%`,
          usagePercent: live.cpuUsagePercent,
          detail: live.cpuDetail ?? 'Coleta em tempo real',
        }
      }
      if (live.cpuDetail) {
        return { displayValue: 'Indisponível', detail: live.cpuDetail }
      }
    } catch {
      // fall through
    }
    const info = await this.resolveServerInfo()
    if (info) {
      return {
        displayValue: 'Indisponível',
        detail: 'Uso de CPU não disponível; exibindo apenas contagem de processadores.',
      }
    }
    return this.fallback.getCpuMetrics()
  }

  async getMemoryMetrics(): Promise<MemoryMetrics> {
    try {
      const live = await this.remote.getMonitoringLive()
      if (live.memoryUsedPercent != null) {
        return {
          usagePercent: live.memoryUsedPercent,
          detail: live.memoryDetail ?? 'Coleta em tempo real',
        }
      }
      if (live.memoryDetail) {
        return { usagePercent: 0, detail: live.memoryDetail }
      }
    } catch {
      // fall through
    }
    const info = await this.resolveServerInfo()
    if (info) return metricsFromServerInfo(info).memory
    return this.fallback.getMemoryMetrics()
  }

  async getStorageMetrics(): Promise<StorageMetrics> {
    try {
      const live = await this.remote.getMonitoringLive()
      const primary = live.volumes[0]
      if (primary?.usedPercent != null && primary.totalBytes != null && primary.availableBytes != null) {
        return {
          usagePercent: primary.usedPercent,
          usedLabel: `${primary.usedPercent}%`,
          totalLabel: `${primary.label}`,
          detail: primary.detail ?? 'Coleta em tempo real',
        }
      }
      if (primary?.detail) {
        return {
          usagePercent: 0,
          usedLabel: 'Indisponível',
          totalLabel: primary.label,
          detail: primary.detail,
        }
      }
    } catch {
      // fall through
    }
    const info = await this.resolveServerInfo()
    if (info) return metricsFromServerInfo(info).storage
    return this.fallback.getStorageMetrics()
  }

  async getNetworkInfo() {
    return this.fallback.getNetworkInfo()
  }

  async getServerInstalledInventory() {
    try {
      const summary = await this.remote.getSystemsRuntimeSummary()
      return { confirmed: true as const, summary }
    } catch {
      return {
        confirmed: false as const,
        message:
          'Inventário no servidor indisponível (local-service não respondeu). A contagem de instalações no disco não pôde ser confirmada.',
      }
    }
  }

  async getInstalledSystemsCount() {
    const inventory = await this.getServerInstalledInventory()
    if (!inventory.confirmed) {
      throw new Error('INSTALLED_INVENTORY_UNAVAILABLE')
    }
    return inventory.summary.installed
  }

  async getSystemsRuntimeSummary() {
    try {
      return await this.remote.getSystemsRuntimeSummary()
    } catch {
      return this.fallback.getSystemsRuntimeSummary()
    }
  }

  async getSystemRuntimeStatus(systemId: string) {
    try {
      return await this.remote.getSystemRuntimeStatus(systemId)
    } catch {
      return this.fallback.getSystemRuntimeStatus(systemId)
    }
  }

  async startSystem(systemId: string) {
    try {
      return await this.remote.startSystem(systemId)
    } catch {
      return this.fallback.startSystem(systemId)
    }
  }

  async stopSystem(systemId: string) {
    try {
      return await this.remote.stopSystem(systemId)
    } catch {
      return this.fallback.stopSystem(systemId)
    }
  }

  async restartSystem(systemId: string) {
    try {
      return await this.remote.restartSystem(systemId)
    } catch {
      return this.fallback.restartSystem(systemId)
    }
  }

  async uninstallSystem(systemId: string) {
    try {
      return await this.remote.uninstallSystem(systemId)
    } catch (error) {
      if (allowMockApiFallback()) {
        return this.fallback.uninstallSystem(systemId)
      }
      return { ok: false, message: formatLocalServiceCommunicationError(error) }
    }
  }

  async analyzeSystem(source: import('../types/projectSource.ts').ProjectSourceInput | string) {
    try {
      return await this.remote.analyzeProject(source)
    } catch {
      if (allowMockApiFallback()) {
        return this.fallback.analyzeSystem(source)
      }
      return {
        ok: false as const,
        message:
          'Serviço local do Manager indisponível (porta 47831). Feche e abra o Servidor Manager ou reinstale a versão mais recente.',
      }
    }
  }

  async getInstallationPlan(
    source: import('../types/projectSource.ts').ProjectSourceInput | string,
    analysis?: SystemAnalysisResult,
    systemId?: string,
  ) {
    try {
      return await this.remote.getInstallationPlan(source, analysis, systemId)
    } catch (error) {
      if (allowMockApiFallback()) {
        return this.fallback.getInstallationPlan(source, analysis, systemId)
      }
      const detail = error instanceof Error ? error.message : String(error)
      return {
        ok: false as const,
        message:
          'Nao foi possivel contactar o servico local (47831). Feche o PowerShell do Manager e abra de novo pelo atalho. Detalhe: ' +
          detail,
      }
    }
  }

  async installProject(input: {
    systemId: string
    sourceUrl?: string
    localFolderPath?: string
    installationPlan: InstallationPlan
    accessMode: import('../types/systemAccessMode.ts').SystemAccessMode
    lanHost?: string
    overlayEnabled?: boolean
    resumeAfterDocker?: boolean
  }) {
    try {
      return await this.remote.installProject(input)
    } catch (error) {
      if (allowMockApiFallback()) {
        return this.fallback.installProject(input)
      }
      const detail = error instanceof Error ? error.message : String(error)
      return {
        ok: false as const,
        message:
          'Serviço local do Manager indisponível (porta 47831). Feche e abra o Servidor Manager ou reinstale a versão mais recente. Detalhe: ' +
          detail,
      }
    }
  }

  async getInstallationProgress(systemId: string) {
    try {
      return await this.remote.getInstallationProgress(systemId)
    } catch {
      return this.fallback.getInstallationProgress(systemId)
    }
  }

  async runManifestBackup(systemId: string) {
    try {
      return await this.remote.runManifestBackup(systemId)
    } catch {
      return this.fallback.runManifestBackup(systemId)
    }
  }

  async runManifestUpdate(systemId: string, options?: { skipBackup?: boolean }) {
    try {
      return await this.remote.runManifestUpdate(systemId, options)
    } catch {
      return this.fallback.runManifestUpdate(systemId, options)
    }
  }

  async getDatabaseHostStatus() {
    try {
      return await this.remote.getDatabaseHostStatus()
    } catch {
      return this.fallback.getDatabaseHostStatus()
    }
  }

  async getDatabaseSummary() {
    try {
      return await this.remote.getDatabaseSummary()
    } catch {
      return this.fallback.getDatabaseSummary()
    }
  }

  async analyzeSystemDatabase(systemId: string) {
    try {
      return await this.remote.analyzeSystemDatabase(systemId)
    } catch {
      return this.fallback.analyzeSystemDatabase(systemId)
    }
  }

  async provisionSystemDatabase(
    systemId: string,
    admin: PostgresAdminCredentialsInput,
  ) {
    try {
      return await this.remote.provisionSystemDatabase(systemId, admin)
    } catch {
      return this.fallback.provisionSystemDatabase(systemId, admin)
    }
  }

  async getSystemServiceStatus(systemId: string) {
    try {
      return await this.remote.getSystemServiceStatus(systemId)
    } catch {
      return this.fallback.getSystemServiceStatus(systemId)
    }
  }

  async installSystemService(systemId: string, automaticStartup: boolean) {
    try {
      return await this.remote.installSystemService(systemId, automaticStartup)
    } catch {
      return this.fallback.installSystemService(systemId, automaticStartup)
    }
  }

  async uninstallSystemService(systemId: string) {
    try {
      return await this.remote.uninstallSystemService(systemId)
    } catch (error) {
      if (allowMockApiFallback()) {
        return this.fallback.uninstallSystemService(systemId)
      }
      return {
        ok: false as const,
        message: formatLocalServiceCommunicationError(error),
      }
    }
  }

  async startSystemService(systemId: string) {
    try {
      return await this.remote.startSystemService(systemId)
    } catch {
      return this.fallback.startSystemService(systemId)
    }
  }

  async stopSystemService(systemId: string) {
    try {
      return await this.remote.stopSystemService(systemId)
    } catch {
      return this.fallback.stopSystemService(systemId)
    }
  }

  async restartSystemService(systemId: string) {
    try {
      return await this.remote.restartSystemService(systemId)
    } catch {
      return this.fallback.restartSystemService(systemId)
    }
  }

  async setSystemServiceStartup(systemId: string, automatic: boolean) {
    try {
      return await this.remote.setSystemServiceStartup(systemId, automatic)
    } catch {
      return this.fallback.setSystemServiceStartup(systemId, automatic)
    }
  }

  async getServerBootstrapStatus() {
    return this.remote.getServerBootstrapStatus()
  }

  async startServerBootstrapInstall(input: {
    installMissing?: boolean
    launchDockerDesktop?: boolean
  }) {
    return this.remote.startServerBootstrapInstall(input)
  }

  async getServerBootstrapJob(jobId: string) {
    return this.remote.getServerBootstrapJob(jobId)
  }

  async getDockerStatus() {
    return this.remote.getDockerStatus()
  }

  async ensureDockerDesktop() {
    return this.remote.ensureDockerDesktop()
  }

  async launchDockerDesktop() {
    return this.remote.launchDockerDesktop()
  }

  async startRemoteValidationSession(systemId: string) {
    try {
      return await this.remote.startRemoteValidationSession(systemId)
    } catch {
      return this.fallback.startRemoteValidationSession(systemId)
    }
  }

  async submitRemoteValidationReport(systemId: string, reportJson: string) {
    try {
      return await this.remote.submitRemoteValidationReport(systemId, reportJson)
    } catch {
      return this.fallback.submitRemoteValidationReport(systemId, reportJson)
    }
  }

  async getBundledOmpsStatus(): Promise<import('../types/bundledOmps.ts').BundledOmpsStatus> {
    try {
      return await this.remote.getBundledOmpsStatus()
    } catch (error) {
      if (isPackagedBundledOmpsProduct()) {
        throw error
      }
      return this.fallback.getBundledOmpsStatus()
    }
  }

  async getServidorOmpsContractAccess(): Promise<
    import('../types/ompsContractAccess.ts').OmpsContractAccessStatusResponse
  > {
    try {
      return await this.remote.getServidorOmpsContractAccess()
    } catch (error) {
      if (isPackagedBundledOmpsProduct()) {
        throw error
      }
      return this.fallback.getServidorOmpsContractAccess()
    }
  }

  async analyzeServidorOmpsAccess(): Promise<
    import('../types/ompsContractAccess.ts').OmpsContractAccessStatusResponse
  > {
    try {
      return await this.remote.analyzeServidorOmpsAccess()
    } catch (error) {
      if (isPackagedBundledOmpsProduct()) {
        throw error
      }
      return this.fallback.analyzeServidorOmpsAccess()
    }
  }

  async getServidorOmpsEmbeddedInstallProgress(): Promise<
    import('../types/servidorOmpsEmbeddedInstallProgress.ts').ServidorOmpsEmbeddedInstallProgressResponse
  > {
    try {
      return await this.remote.getServidorOmpsEmbeddedInstallProgress()
    } catch (error) {
      if (isPackagedBundledOmpsProduct()) {
        throw error
      }
      return this.fallback.getServidorOmpsEmbeddedInstallProgress()
    }
  }

  async pauseServidorOmpsEmbeddedInstall(): Promise<
    import('../types/servidorOmpsEmbeddedInstallControl.ts').ServidorOmpsEmbeddedInstallControlResponse
  > {
    try {
      return await this.remote.pauseServidorOmpsEmbeddedInstall()
    } catch (error) {
      if (isPackagedBundledOmpsProduct()) {
        throw error
      }
      return this.fallback.pauseServidorOmpsEmbeddedInstall()
    }
  }

  async restartServidorOmpsEmbeddedInstall(): Promise<
    import('../types/servidorOmpsEmbeddedInstallControl.ts').ServidorOmpsEmbeddedInstallControlResponse
  > {
    try {
      return await this.remote.restartServidorOmpsEmbeddedInstall()
    } catch (error) {
      if (isPackagedBundledOmpsProduct()) {
        throw error
      }
      return this.fallback.restartServidorOmpsEmbeddedInstall()
    }
  }

  async checkBundledOmpsInstallationDuplicate(): Promise<unknown> {
    try {
      return await this.remote.checkBundledOmpsInstallationDuplicate()
    } catch (error) {
      if (isPackagedBundledOmpsProduct()) {
        throw error
      }
      return this.fallback.checkBundledOmpsInstallationDuplicate()
    }
  }

  async installBundledOmpsServer(input: {
    accessMode: import('../types/systemAccessMode.ts').SystemAccessMode
    duplicateDecision?: import('../types/installationDuplicate.ts').BundledOmpsInstallDuplicateDecision
  }): Promise<import('../types/bundledOmps.ts').BundledOmpsInstallResponse> {
    try {
      return await this.remote.installBundledOmpsServer(input)
    } catch (error) {
      if (isPackagedBundledOmpsProduct()) {
        throw error
      }
      return this.fallback.installBundledOmpsServer(input)
    }
  }

  async getFixedLanPort8080Conflict(
    systemId: string,
  ): Promise<import('../types/fixedLanPort8080.ts').FixedLanPort8080ConflictResponse> {
    try {
      return await this.remote.getFixedLanPort8080Conflict(systemId)
    } catch (error) {
      if (isPackagedBundledOmpsProduct()) throw error
      return this.fallback.getFixedLanPort8080Conflict(systemId)
    }
  }

  async releaseAuthorizedFixedLanPort8080(
    systemId: string,
    input: {
      actionToken: string
      confirm: true
      listener: { pid: number | null; processName: string | null; executablePath: string | null }
    },
  ): Promise<import('../types/fixedLanPort8080.ts').FixedLanPort8080ReleaseResponse> {
    try {
      return await this.remote.releaseAuthorizedFixedLanPort8080(systemId, input)
    } catch (error) {
      if (isPackagedBundledOmpsProduct()) throw error
      return this.fallback.releaseAuthorizedFixedLanPort8080(systemId, input)
    }
  }
}
