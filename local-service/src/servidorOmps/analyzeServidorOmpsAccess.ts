import { autoStartAndWaitDockerEngine } from '../docker/dockerDesktopEnsure.ts'
import { getServidorOmpsContractAccessStatus } from '../products/servidorOmpsContractAccess.ts'
import {
  ensureServidorOmpsEmbeddedRuntime,
  resolveEmbeddedOmpsSystemId,
} from './ensureServidorOmpsEmbeddedRuntime.ts'
import { getEffectiveInstallationProgressSnapshot } from '../installation/installationProgressReconciliation.ts'
import { ensureInstallationProgressHydrated } from '../installation/installationProgressStore.ts'

const ANALYZE_KICKOFF_BUDGET_MS = 6_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldNudgeDockerDuringInstall(
  snapshot: Awaited<ReturnType<typeof getEffectiveInstallationProgressSnapshot>>,
): boolean {
  if (!snapshot) return false
  if (snapshot.status === 'awaiting_docker') return true
  if (snapshot.status !== 'running') return false
  const phase = snapshot.currentPhaseId ?? ''
  return phase.includes('backend') || phase.includes('database')
}

/**
 * Analizar: dispara retomada/subida do motor em background e devolve o probe HTTP cedo.
 * Não espera a instalação inteira (Docker/build/Caddy) — isso continua na barra de progresso.
 */
export async function analyzeServidorOmpsAccess() {
  const kickoff = ensureServidorOmpsEmbeddedRuntime({ forceResume: true }).catch((error) => {
    console.warn(
      '[servidor-omps] Analizar: kickoff do motor embutido:',
      error instanceof Error ? error.message : error,
    )
  })

  await Promise.race([kickoff, sleep(ANALYZE_KICKOFF_BUDGET_MS)])

  const systemId = await resolveEmbeddedOmpsSystemId()
  if (systemId) {
    await ensureInstallationProgressHydrated(systemId)
    const snapshot = await getEffectiveInstallationProgressSnapshot(systemId)
    if (shouldNudgeDockerDuringInstall(snapshot)) {
      void autoStartAndWaitDockerEngine({ autoWaitMs: 120_000 })
    }
  }

  return getServidorOmpsContractAccessStatus()
}
