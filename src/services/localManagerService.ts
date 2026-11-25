import type {
  CpuMetrics,
  MemoryMetrics,
  NetworkInfo,
  ServerStatus,
  ServerInfo,
  StorageMetrics,
  SystemLifecycleResult,
  ServerInstalledInventory,
  SystemsRuntimeSummary,
} from '../types/managerService.ts'
import type { SystemRuntimeResponse } from '../types/systemRuntime.ts'
import type { SystemServiceActionResponse, SystemServiceStatus } from '../types/systemService.ts'
import type { InstallationPlan } from '../types/installationPlan.ts'
import type { InstallationPlanResponse } from '../types/installationPlan.ts'
import type { InstallationProgressResponse } from '../types/installationProgress.ts'
import type { InstallationResponse } from '../types/installationResult.ts'
import type {
  DatabaseHostStatusResponse,
  DatabaseSummary,
  PostgresAdminCredentialsInput,
  SystemDatabaseAnalysisResponse,
  SystemDatabaseProvisionResponse,
} from '../types/database.ts'
import type { ProjectSourceInput } from '../types/projectSource.ts'
import type { SystemAnalysisResponse, SystemAnalysisResult } from '../types/systemAnalysis.ts'
import type {
  ServerBootstrapInstallResponse,
  ServerBootstrapJobResponse,
  ServerBootstrapStatusResponse,
} from '../types/serverBootstrap.ts'
import type { DockerEnsureResponse, DockerStatusResponse } from '../types/dockerEnsure.ts'
import type {
  StartRemoteValidationSessionResponse,
  SubmitRemoteValidationReportResponse,
} from '../types/remoteValidationFlow.ts'

/**
 * Contrato da camada de comunicação com o serviço local do Manager.
 * A UI React deve usar apenas esta interface — nunca comandos do SO diretamente.
 */
export type LocalManagerService = {
  getServerInfo(): Promise<ServerInfo>
  getServerStatus(): Promise<ServerStatus>
  getCpuMetrics(): Promise<CpuMetrics>
  getMemoryMetrics(): Promise<MemoryMetrics>
  getStorageMetrics(): Promise<StorageMetrics>
  getNetworkInfo(): Promise<NetworkInfo>
  /** Preferir para o Dashboard — inventário real no disco via local-service. */
  getServerInstalledInventory(): Promise<ServerInstalledInventory>
  /** Contagem confirmada no servidor; falha se o inventário não pôde ser obtido. */
  getInstalledSystemsCount(): Promise<number>
  getSystemsRuntimeSummary(): Promise<SystemsRuntimeSummary>
  getSystemRuntimeStatus(systemId: string): Promise<SystemRuntimeResponse>
  startSystem(systemId: string): Promise<SystemLifecycleResult>
  stopSystem(systemId: string): Promise<SystemLifecycleResult>
  restartSystem(systemId: string): Promise<SystemLifecycleResult>
  uninstallSystem(systemId: string): Promise<{ ok: boolean; message: string }>
  analyzeSystem(source: ProjectSourceInput | string): Promise<SystemAnalysisResponse>
  getInstallationPlan(
    source: ProjectSourceInput | string,
    analysis?: SystemAnalysisResult,
    systemId?: string,
  ): Promise<InstallationPlanResponse>
  installProject(input: {
    systemId: string
    sourceUrl?: string
    localFolderPath?: string
    installationPlan: InstallationPlan
    accessMode: import('../types/systemAccessMode.ts').SystemAccessMode
    lanHost?: string
    overlayEnabled?: boolean
    resumeAfterDocker?: boolean
  }): Promise<InstallationResponse>
  launchDockerDesktop(): Promise<{ ok: boolean; message: string }>
  getInstallationProgress(systemId: string): Promise<InstallationProgressResponse>
  runManifestBackup(systemId: string): Promise<{ ok: boolean; message: string }>
  runManifestUpdate(
    systemId: string,
    options?: { skipBackup?: boolean },
  ): Promise<{ ok: boolean; message: string; loginUrl?: string }>
  getDatabaseHostStatus(): Promise<DatabaseHostStatusResponse['host']>
  getDatabaseSummary(): Promise<DatabaseSummary>
  analyzeSystemDatabase(systemId: string): Promise<SystemDatabaseAnalysisResponse>
  provisionSystemDatabase(
    systemId: string,
    admin: PostgresAdminCredentialsInput,
  ): Promise<SystemDatabaseProvisionResponse>
  getSystemServiceStatus(systemId: string): Promise<SystemServiceStatus>
  installSystemService(
    systemId: string,
    automaticStartup: boolean,
  ): Promise<SystemServiceActionResponse>
  uninstallSystemService(systemId: string): Promise<SystemServiceActionResponse>
  startSystemService(systemId: string): Promise<SystemServiceActionResponse>
  stopSystemService(systemId: string): Promise<SystemServiceActionResponse>
  restartSystemService(systemId: string): Promise<SystemServiceActionResponse>
  setSystemServiceStartup(
    systemId: string,
    automatic: boolean,
  ): Promise<SystemServiceActionResponse>
  getServerBootstrapStatus(): Promise<ServerBootstrapStatusResponse>
  startServerBootstrapInstall(input: {
    installMissing?: boolean
    launchDockerDesktop?: boolean
  }): Promise<ServerBootstrapInstallResponse>
  getServerBootstrapJob(jobId: string): Promise<ServerBootstrapJobResponse>
  getDockerStatus(): Promise<DockerStatusResponse>
  ensureDockerDesktop(): Promise<DockerEnsureResponse>
  startRemoteValidationSession(systemId: string): Promise<StartRemoteValidationSessionResponse>
  submitRemoteValidationReport(
    systemId: string,
    reportJson: string,
  ): Promise<SubmitRemoteValidationReportResponse>
  getBundledOmpsStatus(): Promise<import('../types/bundledOmps.ts').BundledOmpsStatus>
  getServidorOmpsContractAccess(): Promise<import('../types/ompsContractAccess.ts').OmpsContractAccessStatusResponse>
  analyzeServidorOmpsAccess(): Promise<import('../types/ompsContractAccess.ts').OmpsContractAccessStatusResponse>
  getServidorOmpsEmbeddedInstallProgress(): Promise<
    import('../types/servidorOmpsEmbeddedInstallProgress.ts').ServidorOmpsEmbeddedInstallProgressResponse
  >
  pauseServidorOmpsEmbeddedInstall(): Promise<
    import('../types/servidorOmpsEmbeddedInstallControl.ts').ServidorOmpsEmbeddedInstallControlResponse
  >
  restartServidorOmpsEmbeddedInstall(): Promise<
    import('../types/servidorOmpsEmbeddedInstallControl.ts').ServidorOmpsEmbeddedInstallControlResponse
  >
  checkBundledOmpsInstallationDuplicate(): Promise<unknown>
  installBundledOmpsServer(input: {
    accessMode: import('../types/systemAccessMode.ts').SystemAccessMode
    duplicateDecision?: import('../types/installationDuplicate.ts').BundledOmpsInstallDuplicateDecision
  }): Promise<import('../types/bundledOmps.ts').BundledOmpsInstallResponse>
  getFixedLanPort8080Conflict(
    systemId: string,
  ): Promise<import('../types/fixedLanPort8080.ts').FixedLanPort8080ConflictResponse>
  releaseAuthorizedFixedLanPort8080(
    systemId: string,
    input: {
      actionToken: string
      confirm: true
      listener: { pid: number | null; processName: string | null; executablePath: string | null }
    },
  ): Promise<import('../types/fixedLanPort8080.ts').FixedLanPort8080ReleaseResponse>
}
