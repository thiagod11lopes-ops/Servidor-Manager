import { loadSystems } from '../storage/systemsStorage.ts'
import type {
  CpuMetrics,
  MemoryMetrics,
  NetworkInfo,
  ServerInfo,
  ServerStatus,
  StorageMetrics,
  SystemLifecycleResult,
  ServerInstalledInventory,
  SystemsRuntimeSummary,
} from '../types/managerService.ts'
import type {
  DatabaseHostStatus,
  PostgresAdminCredentialsInput,
  SystemDatabaseAnalysisResponse,
  SystemDatabaseProvisionResponse,
} from '../types/database.ts'
import type { DatabaseSummary } from '../types/database.ts'
import type { SystemRuntimeResponse } from '../types/systemRuntime.ts'
import type { SystemServiceActionResponse, SystemServiceStatus } from '../types/systemService.ts'
import type { InstallationPlan } from '../types/installationPlan.ts'
import type { InstallationPlanResponse } from '../types/installationPlan.ts'
import type { InstallationResponse } from '../types/installationResult.ts'
import type { SystemAnalysisResult } from '../types/systemAnalysis.ts'
import type { LocalManagerService } from './localManagerService.ts'
import { mockAnalyzeSystem } from './mockSystemAnalysis.ts'

function lifecycleNotAvailable(action: string): SystemLifecycleResult {
  return {
    ok: false,
    message: `${action} estará disponível quando o serviço local do Manager for implementado.`,
  }
}

/**
 * Implementação simulada até existir um processo local (HTTP, IPC, etc.).
 */
export class MockLocalManagerService implements LocalManagerService {
  async getServerInfo(): Promise<ServerInfo> {
    return {
      source: 'mock',
      operatingSystem: 'Windows (simulado)',
      computerName: 'Computador local',
      cpuCount: 8,
      memoryTotalBytes: 16 * 1024 ** 3,
      memoryFreeBytes: 9 * 1024 ** 3,
      memoryTotalLabel: '16 GB',
      memoryFreeLabel: '9 GB',
      storagePath: 'C:\\',
      storageTotalBytes: 512 * 1024 ** 3,
      storageAvailableBytes: 200 * 1024 ** 3,
      storageTotalLabel: '512 GB',
      storageAvailableLabel: '200 GB',
    }
  }

  async getServerStatus(): Promise<ServerStatus> {
    return {
      health: 'operational',
      label: 'Operacional',
      detail: 'Computador local',
    }
  }

  async getCpuMetrics(): Promise<CpuMetrics> {
    return {
      displayValue: '18%',
      usagePercent: 18,
      detail: 'Uso demonstrativo',
    }
  }

  async getMemoryMetrics(): Promise<MemoryMetrics> {
    return {
      usagePercent: 42,
      detail: '6,7 GB de 16 GB',
    }
  }

  async getStorageMetrics(): Promise<StorageMetrics> {
    return {
      usagePercent: 61,
      usedLabel: '312 GB',
      totalLabel: '512 GB',
      detail: '312 GB de 512 GB',
    }
  }

  async getNetworkInfo(): Promise<NetworkInfo> {
    return {
      localIp: '192.168.0.10',
      httpPort: 80,
      httpsPort: 443,
      externalAccessEnabled: false,
      detail: 'Rede local — acesso externo não configurado',
    }
  }

  async getServerInstalledInventory(): Promise<ServerInstalledInventory> {
    return {
      confirmed: false,
      message:
        'Inventário no servidor indisponível (local-service não respondeu). A contagem de instalações no disco não pôde ser confirmada.',
    }
  }

  async getInstalledSystemsCount(): Promise<number> {
    const inventory = await this.getServerInstalledInventory()
    if (!inventory.confirmed) {
      throw new Error('INSTALLED_INVENTORY_UNAVAILABLE')
    }
    return inventory.summary.installed
  }

  async getSystemsRuntimeSummary(): Promise<SystemsRuntimeSummary> {
    const systems = loadSystems().filter((system) => system.status === 'instalado')
    const summary: SystemsRuntimeSummary = {
      installed: systems.length,
      running: 0,
      stopped: 0,
      error: 0,
    }

    for (const system of systems) {
      const state = system.runtime?.state
      if (state === 'executando' || state === 'iniciando') summary.running += 1
      else if (state === 'erro') summary.error += 1
      else summary.stopped += 1
    }

    return summary
  }

  async getSystemRuntimeStatus(_systemId: string): Promise<SystemRuntimeResponse> {
    return {
      ok: false,
      message: 'Status de execução disponível apenas com o serviço local ativo.',
    }
  }

  async startSystem(_systemId: string): Promise<SystemLifecycleResult> {
    return lifecycleNotAvailable('Iniciar sistema')
  }

  async stopSystem(_systemId: string): Promise<SystemLifecycleResult> {
    return lifecycleNotAvailable('Parar sistema')
  }

  async restartSystem(_systemId: string): Promise<SystemLifecycleResult> {
    return lifecycleNotAvailable('Reiniciar sistema')
  }

  async uninstallSystem(_systemId: string): Promise<{ ok: boolean; message: string }> {
    return {
      ok: false,
      message: 'Desinstalação disponível apenas com o serviço local (47831) em execução.',
    }
  }

  async analyzeSystem(source: import('../types/projectSource.ts').ProjectSourceInput | string) {
    const sourceUrl = typeof source === 'string' ? source : source.kind === 'git' ? source.sourceUrl : source.localFolderPath
    return mockAnalyzeSystem(sourceUrl)
  }

  async getServerBootstrapStatus() {
    return {
      ok: false as const,
      message: 'Bootstrap disponível apenas com o serviço local (47831) em execução.',
    }
  }

  async startServerBootstrapInstall() {
    return {
      ok: false as const,
      message: 'Bootstrap indisponível — inicie o Servidor Manager pelo atalho oficial.',
    }
  }

  async getServerBootstrapJob(_jobId: string) {
    return { ok: false as const, message: 'Job indisponível sem serviço local.' }
  }

  async getDockerStatus() {
    return {
      ok: true as const,
      state: {
        installed: true,
        running: true,
        detail: 'Mock: Docker considerado pronto.',
        desktopUiRunning: false,
      },
    }
  }

  async launchDockerDesktop() {
    return { ok: false, message: 'Serviço local indisponível.' }
  }

  async ensureDockerDesktop() {
    return {
      ok: true as const,
      state: {
        installed: true,
        running: true,
        detail: 'Mock: Docker considerado pronto.',
        desktopUiRunning: false,
      },
      message: 'Mock: Docker OK.',
    }
  }

  async startRemoteValidationSession(_systemId: string) {
    return {
      ok: false as const,
      message: 'Validação remota disponível apenas com o serviço local (47831) em execução.',
    }
  }

  async submitRemoteValidationReport(_systemId: string, _reportJson: string) {
    return {
      ok: false as const,
      message: 'Importação de relatório disponível apenas com o serviço local (47831) em execução.',
    }
  }

  async getBundledOmpsStatus(): Promise<import('../types/bundledOmps.ts').BundledOmpsStatus> {
    return {
      ok: true,
      available: false,
      reason: 'Pacote Servidor OMPS não disponível (serviço local offline).',
    }
  }

  async getServidorOmpsContractAccess(): Promise<
    import('../types/ompsContractAccess.ts').OmpsContractAccessStatusResponse
  > {
    return {
      ok: false,
      available: false,
      message:
        'Verificação do endereço contratado requer o serviço local (47831). Inicie npm run dev:local-service ou o Servidor Manager instalado.',
      loginUrl: 'http://127.0.0.1:8080/login',
      checkedAt: new Date().toISOString(),
    }
  }

  async analyzeServidorOmpsAccess(): Promise<
    import('../types/ompsContractAccess.ts').OmpsContractAccessStatusResponse
  > {
    return this.getServidorOmpsContractAccess()
  }

  async getServidorOmpsEmbeddedInstallProgress(): Promise<
    import('../types/servidorOmpsEmbeddedInstallProgress.ts').ServidorOmpsEmbeddedInstallProgressResponse
  > {
    return { ok: true, systemId: null, progress: null }
  }

  async pauseServidorOmpsEmbeddedInstall(): Promise<
    import('../types/servidorOmpsEmbeddedInstallControl.ts').ServidorOmpsEmbeddedInstallControlResponse
  > {
    return { ok: false, message: 'Pausar requer o serviço local (47831).' }
  }

  async restartServidorOmpsEmbeddedInstall(): Promise<
    import('../types/servidorOmpsEmbeddedInstallControl.ts').ServidorOmpsEmbeddedInstallControlResponse
  > {
    return { ok: false, message: 'Reiniciar requer o serviço local (47831).' }
  }

  async checkBundledOmpsInstallationDuplicate(): Promise<unknown> {
    return { ok: true, duplicate: false }
  }

  async installBundledOmpsServer(_input: {
    accessMode: import('../types/systemAccessMode.ts').SystemAccessMode
    duplicateDecision?: import('../types/installationDuplicate.ts').BundledOmpsInstallDuplicateDecision
  }): Promise<import('../types/bundledOmps.ts').BundledOmpsInstallResponse> {
    return {
      ok: false as const,
      message: 'Instalação do Servidor OMPS requer o serviço local (47831).',
    }
  }

  async getFixedLanPort8080Conflict(
    _systemId: string,
  ): Promise<import('../types/fixedLanPort8080.ts').FixedLanPort8080ConflictResponse> {
    return { ok: false, message: 'Diagnóstico de porta 8080 indisponível (serviço local offline).' }
  }

  async releaseAuthorizedFixedLanPort8080(
    _systemId: string,
    _input: {
      actionToken: string
      confirm: true
      listener: { pid: number | null; processName: string | null; executablePath: string | null }
    },
  ): Promise<import('../types/fixedLanPort8080.ts').FixedLanPort8080ReleaseResponse> {
    return { ok: false, message: 'Encerramento autorizado indisponível (serviço local offline).' }
  }

  async getInstallationPlan(
    _source: import('../types/projectSource.ts').ProjectSourceInput | string,
    _analysis?: SystemAnalysisResult,
    _systemId?: string,
  ): Promise<InstallationPlanResponse> {
    return {
      ok: false,
      message: 'Serviço local indisponível. Inicie o local-service para gerar o plano.',
    }
  }

  async getDatabaseHostStatus(): Promise<DatabaseHostStatus> {
    return {
      postgresql: {
        psqlAvailable: false,
        pgIsreadyAvailable: false,
        serverReachable: null,
        summary: 'Serviço local indisponível — verificação de PostgreSQL não realizada.',
      },
    }
  }

  async getDatabaseSummary(): Promise<DatabaseSummary> {
    const systemsRequiringDatabase = loadSystems().filter(
      (system) => system.installationPlan?.database?.required,
    ).length
    return { systemsRequiringDatabase, postgresqlServerAvailable: false }
  }

  async analyzeSystemDatabase(_systemId: string): Promise<SystemDatabaseAnalysisResponse> {
    return {
      ok: false,
      message: 'Análise de banco disponível apenas com o serviço local ativo.',
    }
  }

  async getSystemServiceStatus(systemId: string): Promise<SystemServiceStatus> {
    return {
      systemId,
      serviceName: `ServidorManager_${systemId.slice(0, 8)}`,
      installed: false,
      running: false,
      startupMode: 'manual',
      visualState: 'not_installed',
      installedPath: '',
      lastError: null,
      windowsState: null,
    }
  }

  async installSystemService(_systemId: string, _automaticStartup: boolean): Promise<SystemServiceActionResponse> {
    return { ok: false, message: 'Serviço Windows disponível apenas com o local-service ativo.' }
  }

  async uninstallSystemService(_systemId: string): Promise<SystemServiceActionResponse> {
    return { ok: false, message: 'Serviço Windows disponível apenas com o local-service ativo.' }
  }

  async startSystemService(_systemId: string): Promise<SystemServiceActionResponse> {
    return { ok: false, message: 'Serviço Windows disponível apenas com o local-service ativo.' }
  }

  async stopSystemService(_systemId: string): Promise<SystemServiceActionResponse> {
    return { ok: false, message: 'Serviço Windows disponível apenas com o local-service ativo.' }
  }

  async restartSystemService(_systemId: string): Promise<SystemServiceActionResponse> {
    return { ok: false, message: 'Serviço Windows disponível apenas com o local-service ativo.' }
  }

  async setSystemServiceStartup(_systemId: string, _automatic: boolean): Promise<SystemServiceActionResponse> {
    return { ok: false, message: 'Serviço Windows disponível apenas com o local-service ativo.' }
  }

  async provisionSystemDatabase(
    _systemId: string,
    _admin: PostgresAdminCredentialsInput,
  ): Promise<SystemDatabaseProvisionResponse> {
    return {
      ok: false,
      message: 'Provisionamento de banco disponível apenas com o serviço local ativo.',
    }
  }

  async getInstallationProgress(_systemId: string) {
    return { ok: true as const, progress: null }
  }

  async installProject(_input: {
    systemId: string
    sourceUrl?: string
    localFolderPath?: string
    installationPlan: InstallationPlan
    accessMode: import('../types/systemAccessMode.ts').SystemAccessMode
    lanHost?: string
    overlayEnabled?: boolean
    resumeAfterDocker?: boolean
  }): Promise<InstallationResponse> {
    return {
      ok: false,
      message: 'Serviço local indisponível. Inicie o local-service para instalar o projeto.',
    }
  }

  async runManifestBackup(_systemId: string): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'Backup manifest disponível apenas com o serviço local ativo.' }
  }

  async runManifestUpdate(
    _systemId: string,
    _options?: { skipBackup?: boolean },
  ): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'Atualização manifest disponível apenas com o serviço local ativo.' }
  }
}
