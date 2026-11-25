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
  status: 'idle' | 'running' | 'awaiting_docker' | 'interrupted' | 'partial' | 'succeeded' | 'failed'
  startedAt: string
  updatedAt: string
  phases: InstallProgressPhase[]
  currentPhaseId: string | null
  percent: number
  elapsedMs: number
  estimatedRemainingMs: number | null
  error?: string
  failedPhaseId?: string
  result?: import('./installationResult.ts').InstallationResult
}

export type InstallationProgressResponse =
  | { ok: true; progress: InstallationProgressSnapshot | null }
  | { ok: false; message: string }
