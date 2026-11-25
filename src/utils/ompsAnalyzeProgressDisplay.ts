import type { InstallProgressPhase, InstallationProgressSnapshot } from '../types/installationProgress.ts'
import { formatInstallEta } from './installationProgressDisplay.ts'

/** Alinhado a local-service/installationProgressStore.computeInstallProgressPercent */
export function computeInstallProgressPercentFromPhases(phases: InstallProgressPhase[]): number {
  if (phases.length === 0) return 0
  const finished = phases.filter(
    (phase) => phase.status === 'completed' || phase.status === 'skipped',
  ).length
  const running = phases.filter((phase) => phase.status === 'running').length
  if (finished >= phases.length) return 100
  const weighted = finished + (running > 0 ? 0.25 * running : 0)
  return Math.min(99, Math.round((weighted / phases.length) * 100))
}

/**
 * Tempo decorrido da sessão atual (Analizar / Reiniciar), nunca do startedAt antigo da instalação.
 */
export function resolveOmpsAnalyzeSessionElapsedMs(
  analyzeStartedAt: string | null,
  progress: InstallationProgressSnapshot | null,
  nowMs: number,
): number {
  if (analyzeStartedAt) {
    const started = Date.parse(analyzeStartedAt)
    if (Number.isFinite(started)) return Math.max(0, nowMs - started)
  }
  const phaseId = progress?.currentPhaseId
  if (phaseId && progress) {
    const phase = progress.phases.find((item) => item.id === phaseId)
    if (phase?.startedAt) {
      const phaseStart = Date.parse(phase.startedAt)
      if (Number.isFinite(phaseStart)) return Math.max(0, nowMs - phaseStart)
    }
  }
  return 0
}

export function resolveOmpsInstallDisplayPercent(
  progress: InstallationProgressSnapshot | null,
  floorPercent: number,
): number {
  if (!progress) return floorPercent
  const fromPhases = computeInstallProgressPercentFromPhases(progress.phases)
  const raw =
    progress.status === 'succeeded'
      ? 100
      : Math.max(progress.percent ?? 0, fromPhases)
  return Math.min(100, Math.max(floorPercent, raw))
}

export function mergeOmpsEmbeddedInstallProgress(
  previous: InstallationProgressSnapshot | null,
  incoming: InstallationProgressSnapshot | null,
): InstallationProgressSnapshot | null {
  if (!incoming) return previous
  if (!previous) return incoming

  const prevPct = resolveOmpsInstallDisplayPercent(previous, 0)
  const nextPct = resolveOmpsInstallDisplayPercent(incoming, prevPct)

  const preferIncoming =
    incoming.status === 'running' ||
    incoming.status === 'awaiting_docker' ||
    incoming.updatedAt >= previous.updatedAt

  const base = preferIncoming ? incoming : previous
  return {
    ...base,
    percent: nextPct,
    phases: preferIncoming ? incoming.phases : previous.phases,
    currentPhaseId: incoming.currentPhaseId ?? previous.currentPhaseId,
    status:
      previous.status === 'running' || previous.status === 'awaiting_docker'
        ? incoming.status === 'failed' && !incoming.error?.includes('Pausado pelo usuário')
          ? previous.status
          : incoming.status
        : incoming.status,
  }
}

export type OmpsAnalyzeProgressMetrics = {
  percent: number
  elapsedMs: number
  remainingLabel: string
}

export function buildOmpsAnalyzeProgressMetrics(
  progress: InstallationProgressSnapshot | null,
  floorPercent: number,
  nowMs: number,
  analyzeStartedAt: string | null = null,
): OmpsAnalyzeProgressMetrics {
  const percent = resolveOmpsInstallDisplayPercent(progress, floorPercent)
  const elapsedMs = resolveOmpsAnalyzeSessionElapsedMs(analyzeStartedAt, progress, nowMs)
  const remainingLabel = progress ? formatInstallEta(progress) : 'Estimativa sendo calculada…'
  return { percent, elapsedMs, remainingLabel }
}
