import fs from 'node:fs/promises'
import type { InstallationProgressSnapshot } from './installationProgressStore.ts'
import { isInstallationJobRunning } from './installationJobRunner.ts'
import {
  getInstallationProgress,
  isInstallationInProgress,
} from './installationProgressStore.ts'
import {
  loadInstallationProgressSnapshot,
  persistInstallationProgressSnapshot,
} from './installationProgressPersistence.ts'
import { readInstallDockerPause } from './installDockerPause.ts'
import { assertValidSystemId, getManifestPath, getSystemsRoot } from './paths.ts'

export const INTERRUPTED_AFTER_SERVICE_RESTART_MESSAGE =
  'Instalação interrompida: o serviço local (47831) reiniciou ou encerrou durante a execução. Retome a instalação — fases já concluídas no disco serão preservadas quando possível.'

export const STALE_AWAITING_DOCKER_MESSAGE =
  'Instalação pausada aguardando Docker sem checkpoint válido. Retome a instalação ou verifique o Docker Desktop.'

export function isInstallationActivelyExecuting(systemId: string): boolean {
  return isInstallationJobRunning(systemId) || isInstallationInProgress(systemId)
}

type ReconcileContext = {
  hasDockerPauseCheckpoint: boolean
  manifestOk: boolean | null
}

async function readManifestOk(systemId: string): Promise<boolean | null> {
  try {
    const raw = JSON.parse(await fs.readFile(getManifestPath(systemId), 'utf8')) as { ok?: boolean }
    if (raw.ok === true) return true
    if (raw.ok === false) return false
    return null
  } catch {
    return null
  }
}

/** Normaliza snapshot persistido quando não há job ativo neste processo. */
export function reconcilePersistedProgressSnapshot(
  snapshot: InstallationProgressSnapshot,
  context: ReconcileContext,
): InstallationProgressSnapshot {
  if (snapshot.status === 'succeeded' && context.manifestOk !== true) {
    return {
      ...snapshot,
      status: 'partial',
      error:
        snapshot.error ??
        'Instalação reportou sucesso no progresso, mas o manifesto de instalação ainda não está concluído.',
    }
  }

  if (snapshot.status === 'running') {
    return {
      ...snapshot,
      status: 'interrupted',
      error: snapshot.error ?? INTERRUPTED_AFTER_SERVICE_RESTART_MESSAGE,
      failedPhaseId: snapshot.currentPhaseId ?? snapshot.failedPhaseId,
      estimatedRemainingMs: null,
    }
  }

  if (snapshot.status === 'awaiting_docker' && !context.hasDockerPauseCheckpoint) {
    return {
      ...snapshot,
      status: 'interrupted',
      error: snapshot.error ?? STALE_AWAITING_DOCKER_MESSAGE,
      failedPhaseId: snapshot.currentPhaseId ?? snapshot.failedPhaseId,
      estimatedRemainingMs: null,
    }
  }

  return snapshot
}

export async function getEffectiveInstallationProgressSnapshot(
  systemId: string,
): Promise<InstallationProgressSnapshot | null> {
  const inMemory = getInstallationProgress(systemId)
  if (inMemory) return inMemory

  const disk = await loadInstallationProgressSnapshot(systemId)
  if (!disk) return null

  if (isInstallationActivelyExecuting(systemId)) {
    return disk
  }

  const pause = await readInstallDockerPause(systemId)
  const manifestOk = await readManifestOk(systemId)
  return reconcilePersistedProgressSnapshot(disk, {
    hasDockerPauseCheckpoint: pause != null,
    manifestOk,
  })
}

export async function reconcileInstallationProgressForSystem(systemId: string): Promise<boolean> {
  if (isInstallationActivelyExecuting(systemId)) return false

  const disk = await loadInstallationProgressSnapshot(systemId)
  if (!disk) return false

  const pause = await readInstallDockerPause(systemId)
  const manifestOk = await readManifestOk(systemId)
  const next = reconcilePersistedProgressSnapshot(disk, {
    hasDockerPauseCheckpoint: pause != null,
    manifestOk,
  })

  if (
    next.status === disk.status &&
    next.error === disk.error &&
    next.failedPhaseId === disk.failedPhaseId
  ) {
    return false
  }

  await persistInstallationProgressSnapshot({
    ...next,
    updatedAt: new Date().toISOString(),
  })
  return true
}

export async function reconcileInstallationProgressOnStartup(): Promise<void> {
  let entries: string[] = []
  try {
    entries = await fs.readdir(getSystemsRoot())
  } catch {
    return
  }

  for (const entry of entries) {
    try {
      assertValidSystemId(entry)
    } catch {
      continue
    }
    await reconcileInstallationProgressForSystem(entry)
  }
}

export function isResumeEligibleProgressStatus(
  status: InstallationProgressSnapshot['status'],
): boolean {
  return status === 'failed' || status === 'interrupted' || status === 'partial' || status === 'running'
}
