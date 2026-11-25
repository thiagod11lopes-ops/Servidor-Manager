import { getEffectiveInstallationProgressSnapshot } from '../installation/installationProgressReconciliation.ts'
import {
  ensureInstallationProgressHydrated,
  isInstallationInProgress,
} from '../installation/installationProgressStore.ts'
import { isInstallationJobRunning } from '../installation/installationJobRunner.ts'
import { DOCKER_INSTALL_PAUSE_MESSAGE } from '../installation/installDockerPause.ts'

function phaseLabelFromSnapshot(
  snapshot: NonNullable<Awaited<ReturnType<typeof getEffectiveInstallationProgressSnapshot>>>,
): string {
  const id = snapshot.currentPhaseId
  if (id) {
    const row = snapshot.phases.find((phase) => phase.id === id)
    if (row?.label?.trim()) return row.label.trim()
    return id
  }
  const running = snapshot.phases.find((phase) => phase.status === 'running')
  if (running?.label?.trim()) return running.label.trim()
  return 'preparação'
}

/** Contexto para o painel Status quando a porta 8080 ainda não escuta. */
export async function formatServidorOmpsEmbeddedInstallHint(
  systemId: string | null | undefined,
): Promise<string | null> {
  if (!systemId?.trim()) return null
  const id = systemId.trim()
  await ensureInstallationProgressHydrated(id)
  const snapshot = await getEffectiveInstallationProgressSnapshot(id)
  if (!snapshot) return null

  if (snapshot.status === 'running' || snapshot.status === 'awaiting_docker') {
    const label = phaseLabelFromSnapshot(snapshot)
    const dockerNote =
      snapshot.status === 'awaiting_docker' ||
      snapshot.currentPhaseId?.includes('backend') ||
      snapshot.currentPhaseId?.includes('docker')
        ? ' Se parou em Supabase/Docker, confira se o Docker Desktop está com Engine running.'
        : ''
    return `Instalação do motor embutido em andamento (${label}). A porta 8080 só ficará ativa após o proxy (Caddy) subir.${dockerNote}`
  }

  if (snapshot.status === 'failed' || snapshot.status === 'interrupted' || snapshot.status === 'partial') {
    const failedPhase = snapshot.phases.find((phase) => phase.status === 'failed')
    const line =
      snapshot.error?.split('\n')[0]?.trim() ||
      failedPhase?.message?.split('\n')[0]?.trim() ||
      'Use Analizar para retomar a instalação.'
    return `Instalação incompleta: ${line}`
  }

  return null
}

export function isEmbeddedOmpsInstallBusy(systemId: string): boolean {
  return isInstallationJobRunning(systemId) || isInstallationInProgress(systemId)
}

export function dockerPauseHintMessage(): string {
  return DOCKER_INSTALL_PAUSE_MESSAGE
}
