import type {
  DatabaseHostStatus,
  DatabaseHostStatusResponse,
  DatabaseSummary,
  SystemDatabaseAnalysis,
  PostgresAdminCredentialsInput,
  SystemDatabaseAnalysisResponse,
  SystemDatabaseProvisionResponse,
} from '../types/database.ts'
import type { ServerInfo, SystemsRuntimeSummary, SystemLifecycleResult } from '../types/managerService.ts'
import type {
  SystemServiceActionResponse,
  SystemServiceStatus,
} from '../types/systemService.ts'
import type { SystemRuntimeResponse, SystemRuntimeStatus } from '../types/systemRuntime.ts'
import type { InstallationPlan, InstallationPlanResponse } from '../types/installationPlan.ts'
import type {
  ServerBootstrapInstallResponse,
  ServerBootstrapJobResponse,
  ServerBootstrapStatusResponse,
} from '../types/serverBootstrap.ts'
import type { DockerEnsureResponse, DockerStatusResponse } from '../types/dockerEnsure.ts'
import { parseInstallationDuplicateConflict } from '../utils/installationDuplicateConflict.ts'
import type {
  InstallationProgressResponse,
  InstallationProgressSnapshot,
} from '../types/installationProgress.ts'
import type { InstallationResponse, InstallationResult } from '../types/installationResult.ts'
import type { ProjectSourceInput } from '../types/projectSource.ts'
import { projectSourceRequestBody } from '../types/projectSource.ts'
import type { SystemAnalysisResponse, SystemAnalysisResult } from '../types/systemAnalysis.ts'
import type {
  AcompStorageDetail,
  AuthUsersPage,
  DashboardOverviewResponse,
  HistorySample,
  LiveMetricsSnapshot,
  MonitoringAlert,
  MonitoringSettings,
  SystemStorageRow,
} from '../types/monitoring.ts'
import type {
  DatabaseBrowserCatalogResponse,
  DatabaseBrowserMetaResponse,
  DatabaseBrowserRowsResponse,
  DatabaseBrowserSystem,
} from '../types/databaseBrowser.ts'
import { getLocalServiceBaseUrl } from './localServiceConfig.ts'
import { formatLocalServiceCommunicationError } from './localServiceReachability.ts'

function isServerInfo(value: unknown): value is ServerInfo {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    item.source === 'local-service' &&
    typeof item.operatingSystem === 'string' &&
    typeof item.computerName === 'string' &&
    typeof item.cpuCount === 'number'
  )
}

function isSystemAnalysisResult(value: unknown): value is SystemAnalysisResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.mock === 'boolean' &&
    (item.source === 'local-service' || item.source === 'mock') &&
    typeof item.sourceUrl === 'string' &&
    typeof item.projectName === 'string' &&
    typeof item.framework === 'string'
  )
}

function isInstallationPlan(value: unknown): value is InstallationPlan {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    item.source === 'local-service' &&
    typeof item.projectName === 'string' &&
    typeof item.plannedInstallDirectory === 'string' &&
    Array.isArray(item.plannedSteps)
  )
}

function isInstallationResult(value: unknown): value is InstallationResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.systemId === 'string' &&
    typeof item.installDirectory === 'string' &&
    typeof item.projectDirectory === 'string' &&
    Array.isArray(item.messages)
  )
}

function isInstallationResponse(value: unknown): value is InstallationResponse {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.ok === true && item.accepted === true) {
    return typeof item.systemId === 'string'
  }
  if (item.ok === true) return isInstallationResult(item.result)
  if (item.ok === false && item.paused === true) {
    return item.code === 'DOCKER_AWAITING' && typeof item.message === 'string'
  }
  if (item.ok === false) return typeof item.message === 'string'
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isInstallationProgressSnapshot(value: unknown): value is InstallationProgressSnapshot {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.systemId === 'string' &&
    typeof item.status === 'string' &&
    typeof item.percent === 'number' &&
    Array.isArray(item.phases)
  )
}

function isInstallationProgressResponse(value: unknown): value is InstallationProgressResponse {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.ok !== true) return typeof item.message === 'string'
  return item.progress === null || isInstallationProgressSnapshot(item.progress)
}

function isInstallationPlanResponse(value: unknown): value is InstallationPlanResponse {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.ok === true) return isInstallationPlan(item.plan)
  if (item.ok === false) return typeof item.message === 'string'
  return false
}

function isDatabaseHostStatus(value: unknown): value is DatabaseHostStatus {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const pg = item.postgresql
  if (!pg || typeof pg !== 'object') return false
  const post = pg as Record<string, unknown>
  return typeof post.summary === 'string'
}

function isDatabaseHostStatusResponse(value: unknown): value is DatabaseHostStatusResponse {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return item.ok === true && isDatabaseHostStatus(item.host)
}

function isSystemDatabaseAnalysis(value: unknown): value is SystemDatabaseAnalysis {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.systemId === 'string' && typeof item.database === 'object'
}

function isSystemDatabaseProvisionResponse(value: unknown): value is SystemDatabaseProvisionResponse {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.ok === true) {
    return typeof item.message === 'string' && isSystemDatabaseAnalysis(item.analysis)
  }
  if (item.ok === false) {
    return typeof item.message === 'string'
  }
  return false
}

function isSystemDatabaseAnalysisResponse(value: unknown): value is SystemDatabaseAnalysisResponse {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.ok === true) return isSystemDatabaseAnalysis(item.analysis)
  if (item.ok === false) return typeof item.message === 'string'
  return false
}

function isDatabaseSummaryPayload(value: unknown): value is { ok: true; summary: DatabaseSummary } {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.ok !== true || !item.summary || typeof item.summary !== 'object') return false
  const summary = item.summary as Record<string, unknown>
  return (
    typeof summary.systemsRequiringDatabase === 'number' &&
    typeof summary.postgresqlServerAvailable === 'boolean'
  )
}

function isSystemServiceStatus(value: unknown): value is SystemServiceStatus {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.systemId === 'string' && typeof item.serviceName === 'string'
}

function isSystemServiceActionResponse(value: unknown): value is SystemServiceActionResponse {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.ok === true) return isSystemServiceStatus(item.status)
  if (item.ok === false) return typeof item.message === 'string'
  return false
}

function isSystemRuntimeStatus(value: unknown): value is SystemRuntimeStatus {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.systemId === 'string' && typeof item.state === 'string'
}

function isSystemRuntimeResponse(value: unknown): value is SystemRuntimeResponse {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.ok === true) return isSystemRuntimeStatus(item.status)
  if (item.ok === false) return typeof item.message === 'string'
  return false
}

function isLifecycleResult(value: unknown): value is SystemLifecycleResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.ok !== 'boolean' || typeof item.message !== 'string') return false
  if (item.status === undefined) return true
  return isSystemRuntimeStatus(item.status)
}

function isSystemsRuntimeSummaryPayload(
  value: unknown,
): value is { ok: true; summary: SystemsRuntimeSummary } {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.ok !== true || !item.summary || typeof item.summary !== 'object') return false
  const summary = item.summary as Record<string, unknown>
  return (
    typeof summary.installed === 'number' &&
    typeof summary.running === 'number' &&
    typeof summary.stopped === 'number' &&
    typeof summary.error === 'number'
  )
}

function isSystemAnalysisResponse(value: unknown): value is SystemAnalysisResponse {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (item.ok === true) {
    return isSystemAnalysisResult(item.result)
  }
  if (item.ok === false) {
    return typeof item.message === 'string'
  }
  return false
}

export class HttpLocalManagerClient {
  private readonly baseUrl: string

  constructor(baseUrl = getLocalServiceBaseUrl()) {
    this.baseUrl = baseUrl
  }

  async getServerInfo(): Promise<ServerInfo> {
    const response = await fetch(`${this.baseUrl}/api/v1/diagnostics/server-info`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    })

    if (!response.ok) {
      throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    }

    const payload: unknown = await response.json()
    if (!isServerInfo(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload
  }

  async analyzeProject(source: ProjectSourceInput | string): Promise<SystemAnalysisResponse> {
    const body =
      typeof source === 'string' ? { sourceUrl: source } : projectSourceRequestBody(source)
    const response = await fetch(`${this.baseUrl}/api/v1/projects/analyze`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    const payload: unknown = await response.json()
    if (!isSystemAnalysisResponse(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload
  }

  async getInstallationPlan(
    source: ProjectSourceInput | string,
    analysis?: SystemAnalysisResult,
    systemId?: string,
  ): Promise<InstallationPlanResponse> {
    const sourceBody =
      typeof source === 'string' ? { sourceUrl: source } : projectSourceRequestBody(source)
    const response = await fetch(`${this.baseUrl}/api/v1/projects/installation-plan`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...sourceBody, analysis, systemId }),
      signal: AbortSignal.timeout(120_000),
    })

    const payload: unknown = await response.json()
    if (!isInstallationPlanResponse(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload
  }

  private async waitForInstallationOutcome(
    systemId: string,
    options: { maxWaitMs?: number } = {},
  ): Promise<InstallationResponse> {
    const maxWaitMs = options.maxWaitMs ?? 900_000
    const deadline = Date.now() + maxWaitMs
    let consecutivePollErrors = 0

    while (Date.now() < deadline) {
      try {
        const progressResponse = await this.getInstallationProgress(systemId)
        consecutivePollErrors = 0
        if (!progressResponse.ok || !progressResponse.progress) {
          await sleep(800)
          continue
        }
        const progress = progressResponse.progress
        if (progress.status === 'awaiting_docker') {
          return {
            ok: false,
            paused: true,
            code: 'DOCKER_AWAITING',
            message:
              progress.error ??
              'DOCKER NECESSÁRIO, INICIE DOCKER PARA CONTINUAR',
          }
        }
        if (progress.status === 'succeeded' && progress.result) {
          return { ok: true, result: progress.result }
        }
        if (progress.status === 'failed') {
          return {
            ok: false,
            message: progress.error ?? progress.result?.error ?? 'Falha na instalação.',
            result: progress.result,
          }
        }
        if (progress.status === 'interrupted') {
          return {
            ok: false,
            message:
              progress.error ??
              'Instalação interrompida: serviço local reiniciou. Tente Instalar novamente para retomar.',
            result: progress.result,
          }
        }
      } catch {
        consecutivePollErrors += 1
        if (consecutivePollErrors >= 8) {
          return {
            ok: false,
            message:
              'Serviço local (47831) indisponível durante a instalação. Feche o Manager e abra de novo pelo atalho Servidor Manager. O progresso parcial foi salvo em C:\\ServidorManager\\systems quando possível.',
          }
        }
      }
      await sleep(800)
    }

    return {
      ok: false,
      message:
        'Tempo esgotado aguardando a instalação. Verifique o progresso em Meus Sistemas — não inicie outra instalação em paralelo se o serviço local ainda estiver executando etapas.',
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
  }): Promise<InstallationResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/install`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120_000),
    })

    const payload: unknown = await response.json()
    if (!isInstallationResponse(payload)) {
      const fallbackMessage =
        payload &&
        typeof payload === 'object' &&
        typeof (payload as { message?: unknown }).message === 'string'
          ? (payload as { message: string }).message
          : 'LOCAL_SERVICE_INVALID_RESPONSE'
      return { ok: false, message: fallbackMessage }
    }

    if (payload.ok && 'accepted' in payload && payload.accepted) {
      return this.waitForInstallationOutcome(payload.systemId)
    }

    return payload
  }

  async launchDockerDesktop(): Promise<{ ok: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/v1/docker/launch`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
    })
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }
    const item = payload as Record<string, unknown>
    return {
      ok: item.ok === true,
      message: typeof item.message === 'string' ? item.message : 'Resposta inválida ao abrir Docker.',
    }
  }

  async getInstallationProgress(systemId: string): Promise<InstallationProgressResponse> {
    const url = new URL(`${this.baseUrl}/api/v1/projects/install/progress`)
    url.searchParams.set('systemId', systemId)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })

    const payload: unknown = await response.json()
    if (!isInstallationProgressResponse(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload
  }

  async getSystemsRuntimeSummary(): Promise<SystemsRuntimeSummary> {
    const response = await fetch(`${this.baseUrl}/api/v1/diagnostics/systems-runtime-summary`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    }

    const payload: unknown = await response.json()
    if (!isSystemsRuntimeSummaryPayload(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload.summary
  }

  async getSystemRuntimeStatus(systemId: string): Promise<SystemRuntimeResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/systems/${systemId}/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })

    const payload: unknown = await response.json()
    if (!isSystemRuntimeResponse(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload
  }

  private async postSystemLifecycle(
    systemId: string,
    action: 'start' | 'stop' | 'restart',
  ): Promise<SystemLifecycleResult> {
    const response = await fetch(`${this.baseUrl}/api/v1/systems/${systemId}/${action}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(120_000),
    })

    const payload: unknown = await response.json()
    if (!isLifecycleResult(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload
  }

  async startSystem(systemId: string): Promise<SystemLifecycleResult> {
    return this.postSystemLifecycle(systemId, 'start')
  }

  async stopSystem(systemId: string): Promise<SystemLifecycleResult> {
    return this.postSystemLifecycle(systemId, 'stop')
  }

  async restartSystem(systemId: string): Promise<SystemLifecycleResult> {
    return this.postSystemLifecycle(systemId, 'restart')
  }

  async uninstallSystem(systemId: string): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/systems/${encodeURIComponent(systemId)}/uninstall`,
        {
          method: 'POST',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(300_000),
        },
      )

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
      }

      if (payload && typeof payload === 'object') {
        const item = payload as { ok?: boolean; message?: string }
        if (typeof item.message === 'string' && item.message.length > 0) {
          return { ok: item.ok === true, message: item.message }
        }
      }

      if (!response.ok) {
        throw new Error('LOCAL_SERVICE_UNAVAILABLE')
      }

      return { ok: false, message: 'Resposta inválida do serviço local.' }
    } catch (error) {
      return { ok: false, message: formatLocalServiceCommunicationError(error) }
    }
  }

  async runManifestBackup(systemId: string): Promise<{ ok: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/v1/systems/${systemId}/manifest/backup`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(900_000),
    })
    const payload = (await response.json()) as { ok?: boolean; message?: string }
    return { ok: payload.ok === true, message: payload.message ?? 'Resposta inválida.' }
  }

  async runManifestUpdate(
    systemId: string,
    options?: { skipBackup?: boolean },
  ): Promise<{ ok: boolean; message: string; loginUrl?: string }> {
    const response = await fetch(`${this.baseUrl}/api/v1/systems/${systemId}/manifest/update`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ skipBackup: options?.skipBackup === true }),
      signal: AbortSignal.timeout(900_000),
    })
    const payload = (await response.json()) as {
      ok?: boolean
      message?: string
      loginUrl?: string
    }
    return {
      ok: payload.ok === true,
      message: payload.message ?? 'Resposta inválida.',
      loginUrl: payload.loginUrl,
    }
  }

  async getServerBootstrapStatus(): Promise<ServerBootstrapStatusResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/server/bootstrap/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    })
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload as ServerBootstrapStatusResponse
  }

  async startRemoteValidationSession(
    systemId: string,
  ): Promise<import('../types/remoteValidationFlow.ts').StartRemoteValidationSessionResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/systems/${systemId}/remote-validation/session`,
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      },
    )
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload as import('../types/remoteValidationFlow.ts').StartRemoteValidationSessionResponse
  }

  async submitRemoteValidationReport(
    systemId: string,
    reportJson: string,
  ): Promise<import('../types/remoteValidationFlow.ts').SubmitRemoteValidationReportResponse> {
    let parsed: unknown
    try {
      parsed = JSON.parse(reportJson)
    } catch {
      return { ok: false, message: 'JSON inválido.' }
    }
    const response = await fetch(
      `${this.baseUrl}/api/v1/systems/${systemId}/remote-validation/report`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parsed),
        signal: AbortSignal.timeout(15_000),
      },
    )
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload as import('../types/remoteValidationFlow.ts').SubmitRemoteValidationReportResponse
  }

  async getDockerStatus(): Promise<DockerStatusResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/docker/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || (payload as { ok?: unknown }).ok !== true) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }
    return payload as DockerStatusResponse
  }

  async ensureDockerDesktop(): Promise<DockerEnsureResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/docker/ensure`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ wait: true }),
      signal: AbortSignal.timeout(130_000),
    })
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }
    return payload as DockerEnsureResponse
  }

  async startServerBootstrapInstall(input: {
    installMissing?: boolean
    launchDockerDesktop?: boolean
  }): Promise<ServerBootstrapInstallResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/server/bootstrap/install`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
    })
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload as ServerBootstrapInstallResponse
  }

  async getServerBootstrapJob(jobId: string): Promise<ServerBootstrapJobResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/server/bootstrap/jobs/${encodeURIComponent(jobId)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      },
    )
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload as ServerBootstrapJobResponse
  }

  async getDatabaseHostStatus(): Promise<DatabaseHostStatusResponse['host']> {
    const response = await fetch(`${this.baseUrl}/api/v1/database/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    }

    const payload: unknown = await response.json()
    if (!isDatabaseHostStatusResponse(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload.host
  }

  async getDatabaseSummary(): Promise<DatabaseSummary> {
    const response = await fetch(`${this.baseUrl}/api/v1/database/summary`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    }

    const payload: unknown = await response.json()
    if (!isDatabaseSummaryPayload(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload.summary
  }

  async analyzeSystemDatabase(systemId: string): Promise<SystemDatabaseAnalysisResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/${systemId}/database/analyze`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    })

    const payload: unknown = await response.json()
    if (!isSystemDatabaseAnalysisResponse(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload
  }

  async provisionSystemDatabase(
    systemId: string,
    admin: PostgresAdminCredentialsInput,
  ): Promise<SystemDatabaseProvisionResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects/${systemId}/database/provision`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ admin }),
      signal: AbortSignal.timeout(120_000),
    })

    const payload: unknown = await response.json()
    if (!isSystemDatabaseProvisionResponse(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }

    return payload
  }

  async getSystemServiceStatus(systemId: string): Promise<SystemServiceStatus> {
    const response = await fetch(`${this.baseUrl}/api/v1/systems/${systemId}/service/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })

    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || (payload as { ok?: unknown }).ok !== true) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }
    const status = (payload as { status?: unknown }).status
    if (!isSystemServiceStatus(status)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }
    return status
  }

  private async postSystemService(
    systemId: string,
    path: string,
    body?: unknown,
  ): Promise<SystemServiceActionResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/systems/${systemId}/service/${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000),
    })

    const payload: unknown = await response.json()
    if (!isSystemServiceActionResponse(payload)) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }
    return payload
  }

  async installSystemService(
    systemId: string,
    automaticStartup: boolean,
  ): Promise<SystemServiceActionResponse> {
    return this.postSystemService(systemId, 'install', { automaticStartup })
  }

  async uninstallSystemService(systemId: string): Promise<SystemServiceActionResponse> {
    return this.postSystemService(systemId, 'uninstall')
  }

  async startSystemService(systemId: string): Promise<SystemServiceActionResponse> {
    return this.postSystemService(systemId, 'start')
  }

  async stopSystemService(systemId: string): Promise<SystemServiceActionResponse> {
    return this.postSystemService(systemId, 'stop')
  }

  async restartSystemService(systemId: string): Promise<SystemServiceActionResponse> {
    return this.postSystemService(systemId, 'restart')
  }

  async setSystemServiceStartup(
    systemId: string,
    automatic: boolean,
  ): Promise<SystemServiceActionResponse> {
    return this.postSystemService(systemId, automatic ? 'startup/automatic' : 'startup/manual')
  }

  async getMonitoringLive(): Promise<LiveMetricsSnapshot> {
    const response = await fetch(`${this.baseUrl}/api/v1/monitoring/live`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    const payload = (await response.json()) as { ok?: boolean; live?: LiveMetricsSnapshot }
    if (!payload.ok || !payload.live) throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload.live
  }

  async getDashboardOverview(): Promise<DashboardOverviewResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/monitoring/dashboard/overview`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    const payload = (await response.json()) as DashboardOverviewResponse
    if (!payload.ok || !payload.onlineUsers || !payload.operational) {
      throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    }
    return payload
  }

  async getMonitoringHistory(range: '24h' | '7d' | '30d'): Promise<HistorySample[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/monitoring/history?range=${range}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    const payload = (await response.json()) as { ok?: boolean; samples?: HistorySample[] }
    if (!payload.ok || !payload.samples) throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload.samples
  }

  async getMonitoringSystemStorage(): Promise<SystemStorageRow[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/monitoring/storage/systems`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    const payload = (await response.json()) as { ok?: boolean; systems?: SystemStorageRow[] }
    if (!payload.ok || !payload.systems) throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload.systems
  }

  async getMonitoringAlerts(): Promise<MonitoringAlert[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/monitoring/alerts`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    const payload = (await response.json()) as { ok?: boolean; alerts?: MonitoringAlert[] }
    if (!payload.ok || !payload.alerts) throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload.alerts
  }

  async getMonitoringSettings(): Promise<MonitoringSettings> {
    const response = await fetch(`${this.baseUrl}/api/v1/monitoring/settings`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    const payload = (await response.json()) as { ok?: boolean; settings?: MonitoringSettings }
    if (!payload.ok || !payload.settings) throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload.settings
  }

  async getAcompStorageDetail(systemId: string): Promise<AcompStorageDetail> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/monitoring/systems/${encodeURIComponent(systemId)}/acompsolemp-storage`,
      { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(120_000) },
    )
    if (!response.ok) throw new Error('LOCAL_SERVICE_UNAVAILABLE')
    const payload = (await response.json()) as { ok?: boolean; detail?: AcompStorageDetail }
    if (!payload.ok || !payload.detail) throw new Error('LOCAL_SERVICE_INVALID_RESPONSE')
    return payload.detail
  }

  async getAuthUsersPage(systemId: string, page: number, query?: string): Promise<AuthUsersPage> {
    const url = new URL(`${this.baseUrl}/api/v1/monitoring/systems/${encodeURIComponent(systemId)}/auth-users`)
    url.searchParams.set('page', String(page))
    if (query?.trim()) url.searchParams.set('q', query.trim())
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(90_000),
    })
    const payload = (await response.json()) as AuthUsersPage
    return payload
  }

  async disableAuthUser(systemId: string, userId: string): Promise<{ ok: boolean; message: string }> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/monitoring/systems/${encodeURIComponent(systemId)}/auth-users/${encodeURIComponent(userId)}/disable`,
      { method: 'POST', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) },
    )
    return (await response.json()) as { ok: boolean; message: string }
  }

  async deleteAuthUser(systemId: string, userId: string): Promise<{ ok: boolean; message: string }> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/monitoring/systems/${encodeURIComponent(systemId)}/auth-users/${encodeURIComponent(userId)}/delete`,
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    const payload = (await response.json()) as { ok: boolean; message: string }
    if (!response.ok && payload.ok !== false) {
      return { ok: false, message: `Falha ao excluir (HTTP ${response.status}).` }
    }
    return payload
  }

  async getDatabaseBrowserSystems(): Promise<{ ok: true; systems: DatabaseBrowserSystem[] }> {
    const response = await fetch(`${this.baseUrl}/api/v1/database/browser/systems`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    })
    return (await response.json()) as { ok: true; systems: DatabaseBrowserSystem[] }
  }

  async getDatabaseBrowserCatalog(systemId: string): Promise<DatabaseBrowserCatalogResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(systemId)}/database/browser/catalog`,
      { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(180_000) },
    )
    return (await response.json()) as DatabaseBrowserCatalogResponse
  }

  async getDatabaseBrowserTableMeta(
    systemId: string,
    schema: string,
    table: string,
  ): Promise<DatabaseBrowserMetaResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(systemId)}/database/browser/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/meta`,
      { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(45_000) },
    )
    return (await response.json()) as DatabaseBrowserMetaResponse
  }

  async getDatabaseBrowserRows(
    systemId: string,
    schema: string,
    table: string,
    options: {
      page: number
      pageSize: number
      sortColumn?: string
      sortDirection?: 'asc' | 'desc'
      search?: string
      searchColumn?: string
    },
  ): Promise<DatabaseBrowserRowsResponse> {
    const url = new URL(
      `${this.baseUrl}/api/v1/projects/${encodeURIComponent(systemId)}/database/browser/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`,
    )
    url.searchParams.set('page', String(options.page))
    url.searchParams.set('pageSize', String(options.pageSize))
    if (options.sortColumn) url.searchParams.set('sortColumn', options.sortColumn)
    if (options.sortDirection) url.searchParams.set('sortDirection', options.sortDirection)
    if (options.search) url.searchParams.set('search', options.search)
    if (options.searchColumn) url.searchParams.set('searchColumn', options.searchColumn)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    })
    return (await response.json()) as DatabaseBrowserRowsResponse
  }

  async getBundledOmpsStatus(): Promise<import('../types/bundledOmps.ts').BundledOmpsStatus> {
    const response = await fetch(`${this.baseUrl}/api/v1/products/bundled-omps/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    return (await response.json()) as import('../types/bundledOmps.ts').BundledOmpsStatus
  }

  async getServidorOmpsContractAccess(): Promise<
    import('../types/ompsContractAccess.ts').OmpsContractAccessStatusResponse
  > {
    const response = await fetch(`${this.baseUrl}/api/v1/products/servidor-omps/contract-access`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    return (await response.json()) as import('../types/ompsContractAccess.ts').OmpsContractAccessStatusResponse
  }

  async analyzeServidorOmpsAccess(): Promise<
    import('../types/ompsContractAccess.ts').OmpsContractAccessStatusResponse
  > {
    const response = await fetch(`${this.baseUrl}/api/v1/products/servidor-omps/analyze`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      // Kickoff + probe HTTP — não espera a instalação completa (barra acompanha em paralelo).
      signal: AbortSignal.timeout(25_000),
    })
    return (await response.json()) as import('../types/ompsContractAccess.ts').OmpsContractAccessStatusResponse
  }

  async getServidorOmpsEmbeddedInstallProgress(): Promise<
    import('../types/servidorOmpsEmbeddedInstallProgress.ts').ServidorOmpsEmbeddedInstallProgressResponse
  > {
    const response = await fetch(
      `${this.baseUrl}/api/v1/products/servidor-omps/embedded-install-progress`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      },
    )
    return (await response.json()) as import('../types/servidorOmpsEmbeddedInstallProgress.ts').ServidorOmpsEmbeddedInstallProgressResponse
  }

  async pauseServidorOmpsEmbeddedInstall(): Promise<
    import('../types/servidorOmpsEmbeddedInstallControl.ts').ServidorOmpsEmbeddedInstallControlResponse
  > {
    const response = await fetch(
      `${this.baseUrl}/api/v1/products/servidor-omps/embedded-install/pause`,
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      },
    )
    return (await response.json()) as import('../types/servidorOmpsEmbeddedInstallControl.ts').ServidorOmpsEmbeddedInstallControlResponse
  }

  async restartServidorOmpsEmbeddedInstall(): Promise<
    import('../types/servidorOmpsEmbeddedInstallControl.ts').ServidorOmpsEmbeddedInstallControlResponse
  > {
    const response = await fetch(
      `${this.baseUrl}/api/v1/products/servidor-omps/embedded-install/restart`,
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(180_000),
      },
    )
    return (await response.json()) as import('../types/servidorOmpsEmbeddedInstallControl.ts').ServidorOmpsEmbeddedInstallControlResponse
  }

  async checkBundledOmpsInstallationDuplicate(): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/api/v1/installations/duplicate-check`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundledOmps: true }),
      signal: AbortSignal.timeout(30_000),
    })
    return (await response.json()) as unknown
  }

  async installBundledOmpsServer(input: {
    accessMode: import('../types/systemAccessMode.ts').SystemAccessMode
    duplicateDecision?: import('../types/installationDuplicate.ts').BundledOmpsInstallDuplicateDecision
  }): Promise<import('../types/bundledOmps.ts').BundledOmpsInstallResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/products/bundled-omps/install`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120_000),
    })
    const payload: unknown = await response.json()
    if (response.status === 409) {
      const conflict = parseInstallationDuplicateConflict(payload)
      if (conflict) return conflict
    }
    const conflict = parseInstallationDuplicateConflict(payload)
    if (conflict) return conflict
    return payload as import('../types/bundledOmps.ts').BundledOmpsInstallResponse
  }

  async getFixedLanPort8080Conflict(
    systemId: string,
  ): Promise<import('../types/fixedLanPort8080.ts').FixedLanPort8080ConflictResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/systems/${encodeURIComponent(systemId)}/lan-http-port/fixed-8080/conflict`,
      { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) },
    )
    return (await response.json()) as import('../types/fixedLanPort8080.ts').FixedLanPort8080ConflictResponse
  }

  async releaseAuthorizedFixedLanPort8080(
    systemId: string,
    input: {
      actionToken: string
      confirm: true
      listener: { pid: number | null; processName: string | null; executablePath: string | null }
    },
  ): Promise<import('../types/fixedLanPort8080.ts').FixedLanPort8080ReleaseResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/systems/${encodeURIComponent(systemId)}/lan-http-port/fixed-8080/release-authorized`,
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(60_000),
      },
    )
    return (await response.json()) as import('../types/fixedLanPort8080.ts').FixedLanPort8080ReleaseResponse
  }
}
