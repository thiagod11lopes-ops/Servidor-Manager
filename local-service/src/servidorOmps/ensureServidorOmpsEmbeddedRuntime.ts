import fs from 'node:fs/promises'
import { getBundledOmpsServerStatus, startBundledOmpsServerInstall } from '../bundledOmps/installBundledOmpsServer.ts'
import { readBundledOmpsFirstRunRecord } from '../bundledOmps/bundledOmpsFirstRunStore.ts'
import { getManagerInstallRoot } from '../bundledOmps/managerInstallRoot.ts'
import { ensureServidorOmpsProvisionOnStartup } from '../bundledOmps/ensureServidorOmpsProvisionOnStartup.ts'
import { isInstallationActivelyExecuting } from '../installation/installationProgressReconciliation.ts'
import { loadInstallationProgressSnapshot } from '../installation/installationProgressPersistence.ts'
import { getManifestPath, getSystemRoot } from '../installation/paths.ts'
import { isInstallationDuplicateConflict } from '../installation/installationDuplicateGuard.ts'
import {
  isServidorOmpsProduct,
  normalizeServidorOmpsLanAccess,
  readActiveServidorOmpsProductConfig,
} from '../products/servidorOmpsProductConfig.ts'
import { getSystemRuntimeStatus, startManagedSystem } from '../runtime/systemProcessManager.ts'

async function systemDirExists(systemId: string): Promise<boolean> {
  try {
    await fs.access(getSystemRoot(systemId))
    return true
  } catch {
    return false
  }
}

async function manifestInstallComplete(systemId: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await fs.readFile(getManifestPath(systemId), 'utf8')) as { ok?: boolean }
    return raw.ok === true
  } catch {
    return false
  }
}

export async function resolveEmbeddedOmpsSystemId(): Promise<string | null> {
  const status = await getBundledOmpsServerStatus()
  if (status.ok && status.available && status.firstRun?.systemId) {
    return status.firstRun.systemId
  }
  const record = await readBundledOmpsFirstRunRecord()
  if (record?.systemId && (await systemDirExists(record.systemId))) {
    return record.systemId
  }
  return null
}

async function resumeEmbeddedInstallIfStalled(systemId: string): Promise<void> {
  if (isInstallationActivelyExecuting(systemId)) return

  const snapshot = await loadInstallationProgressSnapshot(systemId)
  const manifestOk = await manifestInstallComplete(systemId)
  const record = await readBundledOmpsFirstRunRecord()
  const incompleteRecord = record?.systemId === systemId && !record.completedAt

  const needsResume =
    snapshot != null &&
    (snapshot.status === 'failed' ||
      snapshot.status === 'interrupted' ||
      snapshot.status === 'partial')

  if (!needsResume && manifestOk) return
  if (!needsResume && !incompleteRecord) return

  if (!manifestOk) {
    const product = await readActiveServidorOmpsProductConfig()
    if (!isServidorOmpsProduct(product)) return
    const lan = normalizeServidorOmpsLanAccess(product)
    const accessMode = lan.lanHostMode === 'local' ? 'local' : 'lan'

    let result = await startBundledOmpsServerInstall({
      accessMode,
      duplicateDecision: { action: 'resume', systemId },
    })
    if (isInstallationDuplicateConflict(result) && result.options.canResume) {
      result = await startBundledOmpsServerInstall({
        accessMode,
        duplicateDecision: { action: 'resume', systemId: result.existing.systemId },
      })
    }
    if (!result.ok && !('accepted' in result && result.accepted)) {
      console.warn('[servidor-omps] Retomada do motor embutido:', 'message' in result ? result.message : result)
    }
  }
}

/** Sobe Caddy/serviços quando o manifesto de instalação embarcada já concluiu. */
export async function startEmbeddedOmpsServerIfReady(systemId: string): Promise<void> {
  const record = await readBundledOmpsFirstRunRecord()
  const manifestOk = await manifestInstallComplete(systemId)
  if (!manifestOk && !record?.completedAt) return

  const snapshot = await getSystemRuntimeStatus(systemId)
  const state = snapshot.ok ? snapshot.status?.state : undefined
  const caddy = snapshot.status?.caddyRunning === true
  if (state === 'executando' || caddy) return

  const start = await startManagedSystem(systemId)
  if (!start.ok) {
    console.warn('[servidor-omps] Auto-início do motor embutido:', start.message)
  }
}

/**
 * Motor AcompOPMS embutido no Servidor OMPS: retoma instalação parada e inicia runtime (porta HTTP contratada).
 */
export async function ensureServidorOmpsEmbeddedRuntime(opts?: { forceResume?: boolean }): Promise<void> {
  const installRoot = getManagerInstallRoot()
  if (!installRoot) return

  const product = await readActiveServidorOmpsProductConfig()
  if (!isServidorOmpsProduct(product)) return

  const payload = await getBundledOmpsServerStatus()
  if (!payload.ok || !payload.available) {
    console.warn('[servidor-omps] Payload embarcado indisponível:', payload.ok ? '' : payload.reason)
    return
  }

  await ensureServidorOmpsProvisionOnStartup()

  const systemId = await resolveEmbeddedOmpsSystemId()
  if (!systemId) return

  if (opts?.forceResume) {
    await resumeEmbeddedInstallIfStalled(systemId)
  } else {
    const snapshot = await loadInstallationProgressSnapshot(systemId)
    if (snapshot?.status === 'failed' || snapshot?.status === 'interrupted') {
      await resumeEmbeddedInstallIfStalled(systemId)
    }
  }

  await startEmbeddedOmpsServerIfReady(systemId)
}
