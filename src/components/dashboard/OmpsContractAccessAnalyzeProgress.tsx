import { useEffect, useRef, useState } from 'react'
import type { InstallationProgressSnapshot } from '../../types/installationProgress.ts'
import { findCurrentInstallPhase, formatInstallElapsed } from '../../utils/installationProgressDisplay.ts'
import { buildOmpsAnalyzeProgressMetrics } from '../../utils/ompsAnalyzeProgressDisplay.ts'

type OmpsContractAccessAnalyzeProgressProps = {
  analyzing: boolean
  progress: InstallationProgressSnapshot | null
  analyzeStartedAt: string | null
}

export function OmpsContractAccessAnalyzeProgress({
  analyzing,
  progress,
  analyzeStartedAt,
}: OmpsContractAccessAnalyzeProgressProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const floorPercentRef = useRef(0)

  useEffect(() => {
    floorPercentRef.current = 0
  }, [analyzeStartedAt])

  useEffect(() => {
    const active =
      analyzing ||
      progress?.status === 'running' ||
      progress?.status === 'awaiting_docker' ||
      progress?.status === 'partial'
    if (!active) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [analyzing, progress?.status])

  const metrics = buildOmpsAnalyzeProgressMetrics(
    progress,
    floorPercentRef.current,
    nowMs,
    analyzeStartedAt,
  )

  useEffect(() => {
    if (metrics.percent > floorPercentRef.current) {
      floorPercentRef.current = metrics.percent
    }
  }, [metrics.percent])

  const percent = Math.max(metrics.percent, floorPercentRef.current)

  const currentPhase = progress ? findCurrentInstallPhase(progress) : null
  const phaseLabel =
    currentPhase?.label ??
    (progress?.status === 'interrupted'
      ? 'Pausado'
      : progress?.status === 'failed'
        ? 'Retomando instalação…'
        : analyzing
          ? 'Preparando motor embutido…'
          : null)

  return (
    <div
      className="dashboard-control-lan-access-analyze-progress"
      role="status"
      aria-label="Progresso da preparação do Usuário OMPS"
      aria-live="polite"
      aria-busy={analyzing || progress?.status === 'running' || progress?.status === 'awaiting_docker'}
    >
      <p className="dashboard-control-lan-access-analyze-progress-title">Progresso da preparação</p>
      <div className="install-progress-bar dashboard-control-lan-access-analyze-progress-bar">
        <div
          className="install-progress-bar-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="dashboard-control-lan-access-analyze-progress-meta">
        <span className="install-progress-percent">{percent}%</span>
        <span>
          Tempo decorrido: <strong>{formatInstallElapsed(metrics.elapsedMs)}</strong>
        </span>
        <span>
          Restante: <strong>{metrics.remainingLabel}</strong>
        </span>
      </div>
      {phaseLabel ? (
        <p className="dashboard-control-lan-access-analyze-progress-phase">Fase: {phaseLabel}</p>
      ) : null}
    </div>
  )
}
