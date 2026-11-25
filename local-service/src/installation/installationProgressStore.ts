import {
  clearInstallationProgressSnapshot,
  drainInstallationProgressWrites,
  loadInstallationProgressSnapshot,
  persistInstallationProgressSnapshot,
  scheduleInstallationProgressSnapshot,
} from './installationProgressPersistence.ts'
import {
  isResumeEligibleProgressStatus,
  reconcileInstallationProgressForSystem,
  reconcilePersistedProgressSnapshot,
} from './installationProgressReconciliation.ts'
import { readInstallDockerPause } from './installDockerPause.ts'
import { getManifestPath } from './paths.ts'
import fs from 'node:fs/promises'

export type InstallProgressPhaseStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'blocked'

export type InstallProgressPhase = {
  id: string
  label: string
  description?: string
  status: InstallProgressPhaseStatus
  message?: string
  startedAt?: string
  finishedAt?: string
}

export type InstallationProgressSnapshot = {
  systemId: string
  status:
    | 'idle'
    | 'running'
    | 'awaiting_docker'
    | 'interrupted'
    | 'partial'
    | 'succeeded'
    | 'failed'
  startedAt: string
  updatedAt: string
  phases: InstallProgressPhase[]
  currentPhaseId: string | null
  percent: number
  elapsedMs: number
  /** null = dados insuficientes para estimar */
  estimatedRemainingMs: number | null
  error?: string
  failedPhaseId?: string
  /** Preenchido quando status terminal (sucesso/falha) — permite UI recuperar após instalação assíncrona. */
  result?: {
    ok: boolean
    systemId: string
    installDirectory: string
    projectDirectory: string
    installedAt: string
    dependencyInstall: string
    buildStatus: string
    databaseNote: string
    messages: string[]
    error?: string
  }
}

type ActiveProgress = InstallationProgressSnapshot & {
  phaseIndex: Map<string, number>
}

const active = new Map<string, ActiveProgress>()

export function computeInstallProgressPercent(phases: InstallProgressPhase[]): number {
  if (phases.length === 0) return 0
  const finished = phases.filter(
    (phase) => phase.status === 'completed' || phase.status === 'skipped',
  ).length
  const running = phases.filter((phase) => phase.status === 'running').length
  if (finished >= phases.length) return 100
  const weighted = finished + (running > 0 ? 0.25 * running : 0)
  return Math.min(99, Math.round((weighted / phases.length) * 100))
}

export function estimateRemainingMs(
  phases: InstallProgressPhase[],
  elapsedMs: number,
): number | null {
  const completed = phases.filter((phase) => phase.status === 'completed' && phase.startedAt && phase.finishedAt)
  if (completed.length < 1) return null

  let totalDuration = 0
  for (const phase of completed) {
    const start = Date.parse(phase.startedAt!)
    const end = Date.parse(phase.finishedAt!)
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      totalDuration += end - start
    }
  }
  const avg = totalDuration / completed.length
  const remaining = phases.filter(
    (phase) => phase.status === 'pending' || phase.status === 'running',
  ).length
  if (remaining <= 0) return 0
  return Math.round(avg * remaining)
}

function snapshotOf(entry: ActiveProgress): InstallationProgressSnapshot {
  const now = Date.now()
  const elapsedMs = Math.max(0, now - Date.parse(entry.startedAt))
  const percent =
    entry.status === 'succeeded' ? 100 : computeInstallProgressPercent(entry.phases)
  return {
    systemId: entry.systemId,
    status: entry.status,
    startedAt: entry.startedAt,
    updatedAt: new Date().toISOString(),
    phases: entry.phases.map(({ id, label, description, status, message, startedAt, finishedAt }) => ({
      id,
      label,
      description,
      status,
      message,
      startedAt,
      finishedAt,
    })),
    currentPhaseId: entry.currentPhaseId,
    percent,
    elapsedMs,
    estimatedRemainingMs:
      entry.status === 'running' ? estimateRemainingMs(entry.phases, elapsedMs) : null,
    error: entry.error,
    failedPhaseId: entry.failedPhaseId,
    result: entry.result,
  }
}

function restoreActiveFromSnapshot(snapshot: InstallationProgressSnapshot): ActiveProgress {
  const phaseRows: InstallProgressPhase[] = snapshot.phases.map((phase) => ({ ...phase }))
  const entry: ActiveProgress = {
    ...snapshot,
    phases: phaseRows,
    phaseIndex: new Map(phaseRows.map((phase, index) => [phase.id, index])),
  }
  active.set(snapshot.systemId, entry)
  return entry
}

const hydratedFromDisk = new Set<string>()

async function readManifestOkForProgress(systemId: string): Promise<boolean | null> {
  try {
    const raw = JSON.parse(await fs.readFile(getManifestPath(systemId), 'utf8')) as { ok?: boolean }
    if (raw.ok === true) return true
    if (raw.ok === false) return false
    return null
  } catch {
    return null
  }
}

export async function ensureInstallationProgressHydrated(systemId: string): Promise<void> {
  if (active.has(systemId) || hydratedFromDisk.has(systemId)) return
  hydratedFromDisk.add(systemId)
  await reconcileInstallationProgressForSystem(systemId)
  const disk = await loadInstallationProgressSnapshot(systemId)
  if (!disk) return
  const pause = await readInstallDockerPause(systemId)
  const manifestOk = await readManifestOkForProgress(systemId)
  const snapshot = reconcilePersistedProgressSnapshot(disk, {
    hasDockerPauseCheckpoint: pause != null,
    manifestOk,
  })
  if (snapshot.status !== disk.status || snapshot.error !== disk.error) {
    await persistInstallationProgressSnapshot({
      ...snapshot,
      updatedAt: new Date().toISOString(),
    })
  }
  restoreActiveFromSnapshot(snapshot)
}

export { reconcileInstallationProgressOnStartup } from './installationProgressReconciliation.ts'

export function getInstallationProgress(systemId: string): InstallationProgressSnapshot | null {
  const entry = active.get(systemId)
  if (!entry) return null
  return snapshotOf(entry)
}

export function isInstallationInProgress(systemId: string): boolean {
  const status = active.get(systemId)?.status
  return status === 'running' || status === 'awaiting_docker'
}

export function isInstallationAwaitingDocker(systemId: string): boolean {
  return active.get(systemId)?.status === 'awaiting_docker'
}

export function markInstallationAwaitingDocker(systemId: string, phaseId: string, message: string): void {
  const entry = active.get(systemId)
  if (!entry) return
  entry.status = 'awaiting_docker'
  entry.error = undefined
  entry.failedPhaseId = undefined
  const phase = resolvePhase(entry, phaseId)
  if (phase) {
    phase.status = 'running'
    phase.message = message
    if (!phase.startedAt) phase.startedAt = new Date().toISOString()
  }
  entry.currentPhaseId = phaseId
  touch(entry)
}

export function markInstallationResumedFromDockerWait(systemId: string, message?: string): void {
  const entry = active.get(systemId)
  if (!entry || entry.status !== 'awaiting_docker') return
  entry.status = 'running'
  entry.error = undefined
  if (message && entry.currentPhaseId) {
    const phase = resolvePhase(entry, entry.currentPhaseId)
    if (phase) phase.message = message
  }
  touch(entry)
}

function buildActiveProgressEntry(
  systemId: string,
  phaseRows: InstallProgressPhase[],
  startedAt: string,
  status: InstallationProgressSnapshot['status'] = 'running',
): ActiveProgress {
  return {
    systemId,
    status,
    startedAt,
    updatedAt: startedAt,
    phases: phaseRows,
    currentPhaseId: null,
    percent: 0,
    elapsedMs: 0,
    estimatedRemainingMs: null,
    result: undefined,
    phaseIndex: new Map(phaseRows.map((phase, index) => [phase.id, index])),
  }
}

/**
 * Nova tentativa após falha/interrupção: preserva fases concluídas no disco e só repõe pendentes/falhas.
 */
export async function beginInstallationProgressForAttempt(
  systemId: string,
  phases: Array<{ id: string; label: string; description?: string }>,
): Promise<InstallationProgressSnapshot> {
  const existing = active.get(systemId)
  if (existing?.status === 'running' || existing?.status === 'awaiting_docker') {
    throw new Error('INSTALL_ALREADY_RUNNING')
  }

  await drainInstallationProgressWrites(systemId)
  await reconcileInstallationProgressForSystem(systemId)
  const priorRaw = await loadInstallationProgressSnapshot(systemId)
  const pause = await readInstallDockerPause(systemId)
  const manifestOk = await readManifestOkForProgress(systemId)
  const prior = priorRaw
    ? reconcilePersistedProgressSnapshot(priorRaw, {
        hasDockerPauseCheckpoint: pause != null,
        manifestOk,
      })
    : null
  const canResumeFromDisk =
    prior &&
    prior.systemId === systemId &&
    isResumeEligibleProgressStatus(prior.status) &&
    prior.phases.length > 0

  const now = new Date().toISOString()
  if (canResumeFromDisk) {
    const priorById = new Map(prior!.phases.map((phase) => [phase.id, phase]))
    const phaseRows: InstallProgressPhase[] = phases.map((phase) => {
      const old = priorById.get(phase.id)
      if (!old) {
        return { id: phase.id, label: phase.label, description: phase.description, status: 'pending' }
      }
      if (
        old.status === 'completed' ||
        old.status === 'skipped' ||
        old.status === 'blocked'
      ) {
        return {
          id: phase.id,
          label: phase.label,
          description: phase.description,
          status: old.status,
          message: old.message,
          startedAt: old.startedAt,
          finishedAt: old.finishedAt,
        }
      }
      return {
        id: phase.id,
        label: phase.label,
        description: phase.description,
        status: 'pending',
        message: old.status === 'failed' ? 'Nova tentativa desta fase.' : undefined,
      }
    })
    const entry = buildActiveProgressEntry(systemId, phaseRows, prior!.startedAt, 'running')
    active.set(systemId, entry)
    touch(entry)
    return snapshotOf(entry)
  }

  return beginInstallationProgress(systemId, phases)
}

export function beginInstallationProgress(
  systemId: string,
  phases: Array<{ id: string; label: string; description?: string }>,
): InstallationProgressSnapshot {
  const existing = active.get(systemId)
  if (existing?.status === 'running' || existing?.status === 'awaiting_docker') {
    throw new Error('INSTALL_ALREADY_RUNNING')
  }

  const now = new Date().toISOString()
  const phaseRows: InstallProgressPhase[] = phases.map((phase) => ({
    id: phase.id,
    label: phase.label,
    description: phase.description,
    status: 'pending',
  }))
  const entry = buildActiveProgressEntry(systemId, phaseRows, now)
  active.set(systemId, entry)
  void drainInstallationProgressWrites(systemId).then(() => clearInstallationProgressSnapshot(systemId))
  return snapshotOf(entry)
}

function touch(entry: ActiveProgress) {
  entry.updatedAt = new Date().toISOString()
  scheduleInstallationProgressSnapshot(snapshotOf(entry))
}

function resolvePhase(entry: ActiveProgress, phaseId: string): InstallProgressPhase | null {
  const index = entry.phaseIndex.get(phaseId)
  if (index === undefined) return null
  return entry.phases[index] ?? null
}

export function markInstallationPhaseRunning(systemId: string, phaseId: string, message?: string): void {
  const entry = active.get(systemId)
  if (!entry || (entry.status !== 'running' && entry.status !== 'awaiting_docker')) return
  const phase = resolvePhase(entry, phaseId)
  if (!phase) return
  const now = new Date().toISOString()
  phase.status = 'running'
  phase.startedAt = now
  phase.message = message
  entry.currentPhaseId = phaseId
  touch(entry)
}

export function markInstallationPhaseCompleted(systemId: string, phaseId: string, message?: string): void {
  const entry = active.get(systemId)
  if (!entry || (entry.status !== 'running' && entry.status !== 'awaiting_docker')) return
  const phase = resolvePhase(entry, phaseId)
  if (!phase) return
  phase.status = 'completed'
  phase.finishedAt = new Date().toISOString()
  if (message) phase.message = message
  if (entry.currentPhaseId === phaseId) {
    entry.currentPhaseId = null
  }
  touch(entry)
}

export function markInstallationPhaseSkipped(systemId: string, phaseId: string, message?: string): void {
  const entry = active.get(systemId)
  if (!entry || entry.status !== 'running') return
  const phase = resolvePhase(entry, phaseId)
  if (!phase) return
  phase.status = 'skipped'
  phase.finishedAt = new Date().toISOString()
  if (message) phase.message = message
  touch(entry)
}

export function markInstallationPhaseFailed(
  systemId: string,
  phaseId: string,
  message: string,
): void {
  const entry = active.get(systemId)
  if (!entry) return
  const phase = resolvePhase(entry, phaseId)
  if (phase) {
    phase.status = 'failed'
    phase.finishedAt = new Date().toISOString()
    phase.message = message
  }
  entry.status = 'failed'
  entry.failedPhaseId = phaseId
  entry.error = message
  entry.currentPhaseId = phaseId
  touch(entry)
}

export function markInstallationPhaseBlocked(
  systemId: string,
  phaseId: string,
  message: string,
): void {
  const entry = active.get(systemId)
  if (!entry) return
  const phase = resolvePhase(entry, phaseId)
  if (phase) {
    phase.status = 'blocked'
    phase.finishedAt = new Date().toISOString()
    phase.message = message
  }
  entry.status = 'failed'
  entry.failedPhaseId = phaseId
  entry.error = message
  entry.currentPhaseId = phaseId
  touch(entry)
}

export function completeInstallationProgress(
  systemId: string,
  result?: InstallationProgressSnapshot['result'],
): InstallationProgressSnapshot | null {
  const entry = active.get(systemId)
  if (!entry) return null
  for (const phase of entry.phases) {
    if (phase.status === 'pending') phase.status = 'skipped'
    if (phase.status === 'running') {
      phase.status = 'completed'
      phase.finishedAt = new Date().toISOString()
    }
  }
  entry.status = 'succeeded'
  entry.currentPhaseId = null
  if (result) entry.result = result
  touch(entry)
  return snapshotOf(entry)
}

export function applyInstallationPhaseProgressEvent(
  systemId: string,
  event: {
    phaseId: string
    status: 'running' | 'completed' | 'failed' | 'skipped' | 'blocked'
    message?: string
  },
): void {
  switch (event.status) {
    case 'running':
      markInstallationPhaseRunning(systemId, event.phaseId, event.message)
      break
    case 'completed':
      markInstallationPhaseCompleted(systemId, event.phaseId, event.message)
      break
    case 'skipped':
      markInstallationPhaseSkipped(systemId, event.phaseId, event.message)
      break
    case 'failed':
      markInstallationPhaseFailed(systemId, event.phaseId, event.message ?? 'Falha na fase.')
      break
    case 'blocked':
      markInstallationPhaseBlocked(systemId, event.phaseId, event.message ?? 'Fase bloqueada.')
      break
  }
}

export function failInstallationProgress(
  systemId: string,
  error: string,
  failedPhaseId?: string,
  result?: InstallationProgressSnapshot['result'],
): void {
  const entry = active.get(systemId)
  if (!entry) return
  if (entry.status === 'failed') return
  entry.status = 'failed'
  entry.error = error
  if (failedPhaseId) entry.failedPhaseId = failedPhaseId
  if (result) entry.result = result
  touch(entry)
}

/** Interrompe instalação sem marcar como falha definitiva (pausar / reinício do serviço). */
export function interruptInstallationProgress(systemId: string, message: string): void {
  const entry = active.get(systemId)
  if (!entry) return
  if (entry.status === 'succeeded') return
  const phaseId = entry.currentPhaseId
  if (phaseId) {
    const phase = resolvePhase(entry, phaseId)
    if (phase && (phase.status === 'running' || phase.status === 'pending')) {
      phase.status = 'failed'
      phase.finishedAt = new Date().toISOString()
      phase.message = message
    }
  }
  entry.status = 'interrupted'
  entry.error = message
  entry.failedPhaseId = phaseId ?? entry.failedPhaseId
  touch(entry)
}

export function clearInstallationProgressState(systemId: string): void {
  active.delete(systemId)
  hydratedFromDisk.delete(systemId)
  void clearInstallationProgressSnapshot(systemId)
}
