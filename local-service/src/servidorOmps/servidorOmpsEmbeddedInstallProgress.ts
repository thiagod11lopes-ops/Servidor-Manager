import { getEffectiveInstallationProgressSnapshot } from '../installation/installationProgressReconciliation.ts'
import {
  ensureInstallationProgressHydrated,
  getInstallationProgress,
} from '../installation/installationProgressStore.ts'
import { resolveEmbeddedOmpsSystemId } from './ensureServidorOmpsEmbeddedRuntime.ts'

export type ServidorOmpsEmbeddedInstallProgressResponse = {
  ok: true
  systemId: string | null
  progress: Awaited<ReturnType<typeof getEffectiveInstallationProgressSnapshot>>
}

export async function getServidorOmpsEmbeddedInstallProgress(): Promise<ServidorOmpsEmbeddedInstallProgressResponse> {
  const systemId = await resolveEmbeddedOmpsSystemId()
  if (!systemId) {
    return { ok: true, systemId: null, progress: null }
  }
  await ensureInstallationProgressHydrated(systemId)
  const live = getInstallationProgress(systemId)
  const progress =
    live ??
    (await getEffectiveInstallationProgressSnapshot(systemId))
  return { ok: true, systemId, progress }
}
