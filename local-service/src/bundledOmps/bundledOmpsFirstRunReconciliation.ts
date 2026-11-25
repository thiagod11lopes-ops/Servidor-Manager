import fs from 'node:fs/promises'
import path from 'node:path'
import { getManagerInstallRoot } from './managerInstallRoot.ts'
import { getManifestPath, getSystemRoot } from '../installation/paths.ts'
import {
  clearBundledOmpsFirstRunForSystem,
  markBundledOmpsFirstRunCompleted,
  readBundledOmpsFirstRunRecord,
  updateBundledOmpsFirstRunInstallBinding,
} from './bundledOmpsFirstRunStore.ts'
import { verifyBundledOmpsPayloadAtInstallRoot } from './verifyBundledOmpsPayload.ts'

async function systemHasCompletedManifest(systemId: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await fs.readFile(getManifestPath(systemId), 'utf8')) as { ok?: boolean }
    return raw.ok === true
  } catch {
    return false
  }
}

async function syncBundledOmpsFirstRunInstallBinding(): Promise<void> {
  const record = await readBundledOmpsFirstRunRecord()
  const installRoot = getManagerInstallRoot()
  if (!record || !installRoot) return

  try {
    await fs.access(getSystemRoot(record.systemId))
  } catch {
    return
  }

  const verified = await verifyBundledOmpsPayloadAtInstallRoot(installRoot)
  if (!verified.ok) return

  await updateBundledOmpsFirstRunInstallBinding({
    installRoot: path.resolve(installRoot),
    bundleContentSha256: verified.verified.contentSha256,
  })
}

/** Alinha first-run com artefatos reais após reinício do serviço (sem apagar registro válido). */
export async function reconcileBundledOmpsFirstRunOnStartup(): Promise<void> {
  await syncBundledOmpsFirstRunInstallBinding()

  const record = await readBundledOmpsFirstRunRecord()
  if (!record) return

  let systemDirExists = false
  try {
    await fs.access(getSystemRoot(record.systemId))
    systemDirExists = true
  } catch {
    systemDirExists = false
  }

  if (!systemDirExists) {
    await clearBundledOmpsFirstRunForSystem(record.systemId)
    return
  }

  if (record.completedAt) return
  if (await systemHasCompletedManifest(record.systemId)) {
    await markBundledOmpsFirstRunCompleted(record.systemId)
  }
}
