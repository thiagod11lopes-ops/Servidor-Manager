import {
  parseSystemAccessMode,
  writeSystemAccessModeConfig,
} from '../config/systemAccessMode.ts'
import type { InstallationPlanPayload } from '../plan/buildInstallationPlan.ts'
import { buildInstallationProgressPhases } from '../installation/installationProgressFromPlan.ts'
import {
  beginInstallationProgressForAttempt,
  completeInstallationProgress,
  failInstallationProgress,
  getInstallationProgress,
  interruptInstallationProgress,
  isInstallationAwaitingDocker,
  isInstallationInProgress,
  markInstallationResumedFromDockerWait,
} from '../installation/installationProgressStore.ts'
import {
  clearInstallDockerPause,
  DOCKER_INSTALL_PAUSE_MESSAGE,
  readInstallDockerPause,
} from '../installation/installDockerPause.ts'
import { appendInstallationDiagnostic } from '../installation/installationDiagnosticLog.ts'
import { isInstallationJobRunning, scheduleInstallationJob } from '../installation/installationJobRunner.ts'
import {
  clearInstallationUserPause,
  USER_PAUSE_MESSAGE,
} from '../installation/installationUserControl.ts'
import { probeDockerEngine } from '../docker/dockerDesktopEnsure.ts'
import { runInstallation } from '../installation/installationManager.ts'
import { assertValidSystemId } from '../installation/paths.ts'
import {
  resolveInstallAccessHostForLanMode,
  resolveInstallAccessHostForLocalMode,
} from '../serverManifest/resolveInstallAccessHost.ts'
import { parseProjectInstallSource } from '../sources/projectInstallSource.ts'
import { findInstallationDuplicateConflict } from '../installation/installationDuplicateGuard.ts'
import type { InstallationDuplicateConflict } from '../installation/installationDuplicateGuard.ts'
import { installationSourceKeyFromSourceUrl } from '../installation/normalizeInstallationSourceKey.ts'
import { withInstallationSourceLock } from '../installation/installationSourceLock.ts'

function isInstallationPlan(value: unknown): value is InstallationPlanPayload {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    item.source === 'local-service' &&
    typeof item.packageManager === 'string' &&
    typeof item.projectName === 'string' &&
    Array.isArray(item.installCommands)
  )
}

export type InstallProjectAcceptedResponse = {
  ok: true
  accepted: true
  systemId: string
}

export type InstallProjectResponse =
  | InstallProjectAcceptedResponse
  | { ok: true; result: import('../installation/installationManager.ts').InstallationResultPayload }
  | { ok: false; message: string; result?: import('../installation/installationManager.ts').InstallationResultPayload }
  | { ok: false; paused: true; code: 'DOCKER_AWAITING'; message: string }
  | InstallationDuplicateConflict

async function executeInstallationJob(
  systemId: string,
  installParams: Parameters<typeof runInstallation>[0],
): Promise<void> {
  const progress = () => getInstallationProgress(systemId)
  await appendInstallationDiagnostic({
    systemId,
    phaseId: progress()?.currentPhaseId,
    event: 'job_started',
  })

  try {
    const response = await runInstallation(installParams)

    if ('paused' in response && response.paused) {
      await appendInstallationDiagnostic({
        systemId,
        phaseId: 'install.prerequisites',
        event: 'docker_pause',
        detail: response.message,
      })
      return
    }

    if (!response.ok) {
      const phaseId = progress()?.failedPhaseId ?? progress()?.currentPhaseId ?? undefined
      const error = response.result.error ?? 'Falha na instalação.'
      if (error.includes('Pausado pelo usuário')) {
        interruptInstallationProgress(systemId, USER_PAUSE_MESSAGE)
        await appendInstallationDiagnostic({
          systemId,
          phaseId: phaseId ?? null,
          event: 'job_paused_by_user',
          detail: USER_PAUSE_MESSAGE,
        })
        return
      }
      failInstallationProgress(systemId, error, phaseId, response.result)
      await appendInstallationDiagnostic({
        systemId,
        phaseId: phaseId ?? null,
        event: 'job_failed',
        detail: response.result.error,
        outputTail: response.result.messages.slice(-5).join('\n'),
      })
      return
    }

    await clearInstallDockerPause(systemId)
    completeInstallationProgress(systemId, response.result)
    if (response.result.ok) {
      const { markInstallCompleteIfBundled } = await import('../bundledOmps/installBundledOmpsServer.ts')
      await markInstallCompleteIfBundled(systemId)
    }
    await appendInstallationDiagnostic({
      systemId,
      event: 'job_succeeded',
      detail: response.result.projectDirectory,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha inesperada na instalação.'
    const phaseId = progress()?.currentPhaseId ?? undefined
    failInstallationProgress(systemId, message, phaseId)
    await appendInstallationDiagnostic({
      systemId,
      phaseId: phaseId ?? null,
      event: 'job_exception',
      detail: message,
    })
  }
}

export async function installProject(input: {
  systemId: unknown
  sourceUrl?: unknown
  localFolderPath?: unknown
  installationPlan: unknown
  accessMode?: unknown
  lanHost?: unknown
  overlayEnabled?: unknown
  resumeAfterDocker?: unknown
  skipDuplicateGuard?: unknown
}): Promise<InstallProjectResponse> {
  const resumeAfterDocker = input.resumeAfterDocker === true
  const skipDuplicateGuard = input.skipDuplicateGuard === true

  if (typeof input.systemId !== 'string') {
    return {
      ok: false as const,
      message: 'Informe systemId válido.',
    }
  }

  try {
    assertValidSystemId(input.systemId)
  } catch {
    return { ok: false as const, message: 'Parâmetros de instalação inválidos.' }
  }

  const parsedSource = await parseProjectInstallSource({
    sourceUrl: input.sourceUrl,
    localFolderPath: input.localFolderPath,
  })
  if (!parsedSource.ok) {
    return { ok: false as const, message: parsedSource.message }
  }

  if (!isInstallationPlan(input.installationPlan)) {
    return { ok: false as const, message: 'Plano de instalação REAL é obrigatório.' }
  }

  const accessMode = parseSystemAccessMode(input.accessMode)
  if (!accessMode) {
    return {
      ok: false as const,
      message:
        'Selecione o modo de acesso antes de instalar: local (neste PC) ou rede local (LAN).',
    }
  }

  const savedMode = writeSystemAccessModeConfig(input.systemId, accessMode)
  if (!savedMode.ok) {
    return { ok: false as const, message: savedMode.message }
  }

  let lanHost =
    typeof input.lanHost === 'string' && input.lanHost.trim().length > 0 ? input.lanHost.trim() : undefined
  let overlayEnabled = input.overlayEnabled === true

  if (accessMode === 'local') {
    overlayEnabled = false
    const resolved = resolveInstallAccessHostForLocalMode()
    if (!resolved.ok) {
      return { ok: false as const, message: resolved.message }
    }
    lanHost = resolved.host
  } else if (!lanHost || lanHost === 'auto') {
    const resolved = resolveInstallAccessHostForLanMode()
    if (!resolved.ok) {
      return { ok: false as const, message: resolved.message }
    }
    lanHost = resolved.host
  }

  const systemId = input.systemId
  const pauseCheckpoint = await readInstallDockerPause(systemId)
  const awaitingDocker = isInstallationAwaitingDocker(systemId)

  if (resumeAfterDocker) {
    if (!awaitingDocker && !pauseCheckpoint) {
      return {
        ok: false as const,
        message: 'Não há instalação pausada aguardando Docker para este sistema.',
      }
    }
    const engine = await probeDockerEngine()
    if (!engine.running) {
      return {
        ok: false as const,
        paused: true as const,
        code: 'DOCKER_AWAITING' as const,
        message: DOCKER_INSTALL_PAUSE_MESSAGE,
      }
    }
    markInstallationResumedFromDockerWait(systemId, 'Docker Engine pronto — retomando instalação…')
  } else if (isInstallationInProgress(systemId) || isInstallationJobRunning(systemId)) {
    return {
      ok: false as const,
      message: awaitingDocker
        ? 'Instalação pausada aguardando Docker. Use “Verificar novamente” no modal.'
        : 'Já existe uma instalação em andamento para este sistema. Aguarde a conclusão ou acompanhe o progresso.',
    }
  }

  if (!resumeAfterDocker && !skipDuplicateGuard) {
    let sourceKey: string
    try {
      sourceKey = installationSourceKeyFromSourceUrl(parsedSource.source.sourceUrl)
    } catch {
      return { ok: false as const, message: 'Origem de instalação inválida.' }
    }
    const duplicate = await withInstallationSourceLock([sourceKey], () =>
      findInstallationDuplicateConflict({
        sourceKeys: [sourceKey],
        excludeSystemId: systemId,
      }),
    )
    if (duplicate) {
      return duplicate
    }
  }

  const installParams = {
    systemId,
    projectSource: parsedSource.source,
    plan: pauseCheckpoint?.plan ?? input.installationPlan,
    accessMode: pauseCheckpoint?.accessMode ?? accessMode,
    lanHost: pauseCheckpoint?.lanHost ?? lanHost,
    overlayEnabled: pauseCheckpoint?.overlayEnabled ?? overlayEnabled,
    resumeAfterDockerPause: resumeAfterDocker,
  }

  clearInstallationUserPause(systemId)

  if (!resumeAfterDocker) {
    await beginInstallationProgressForAttempt(
      systemId,
      buildInstallationProgressPhases(installParams.plan),
    )
  }

  const scheduled = scheduleInstallationJob(systemId, () => executeInstallationJob(systemId, installParams))
  if (!scheduled.accepted) {
    return { ok: false as const, message: scheduled.message }
  }

  return { ok: true as const, accepted: true as const, systemId }
}
