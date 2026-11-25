import type { InstallProgressPhase, InstallationProgressSnapshot } from '../types/installationProgress.ts'

export function formatInstallElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  }
  return `${seconds}s`
}

export function formatInstallEta(snapshot: InstallationProgressSnapshot): string {
  if (snapshot.status === 'succeeded') return 'Concluído'
  if (snapshot.status === 'failed') return '—'
  if (snapshot.estimatedRemainingMs == null) return 'Estimativa sendo calculada…'
  if (snapshot.estimatedRemainingMs <= 0) return 'Finalizando…'
  return `~${formatInstallElapsed(snapshot.estimatedRemainingMs)} restantes`
}

export function findCurrentInstallPhase(
  snapshot: InstallationProgressSnapshot,
): InstallProgressPhase | null {
  if (snapshot.currentPhaseId) {
    return snapshot.phases.find((phase) => phase.id === snapshot.currentPhaseId) ?? null
  }
  return snapshot.phases.find((phase) => phase.status === 'running') ?? null
}

export function partitionInstallPhases(phases: InstallProgressPhase[]): {
  completed: InstallProgressPhase[]
  pending: InstallProgressPhase[]
  failed: InstallProgressPhase | null
} {
  const completed = phases.filter(
    (phase) =>
      phase.status === 'completed' || phase.status === 'skipped' || phase.status === 'blocked',
  )
  const pending = phases.filter((phase) => phase.status === 'pending')
  const failed = phases.find((phase) => phase.status === 'failed') ?? null
  return { completed, pending, failed }
}
