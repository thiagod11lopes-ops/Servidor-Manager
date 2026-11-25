import fs from 'node:fs/promises'
import path from 'node:path'
import { getServerManifestStatePath } from '../installation/paths.ts'
import { parseLocalFolderSourceUrl } from '../sources/localFolderSource.ts'
import { syncBundledOmpsServidorLanToProject } from './syncBundledOmpsServidorLan.ts'
import { getManagerInstallRoot } from './managerInstallRoot.ts'
import { verifyBundledOmpsPayloadAtInstallRoot } from './verifyBundledOmpsPayload.ts'

const LAN_PHASES_RERUN_AFTER_PAYLOAD_SYNC = ['proxy.start', 'connection.generate-runtime', 'proxy.generate-config']

/**
 * Antes do item 4 (LAN): alinha scripts do payload empacotado e invalida fases LAN já marcadas OK se o payload mudou.
 */
export async function prepareBundledOmpsLanResume(input: {
  systemId: string
  projectDirectory: string
  sourceUrl: string
  skipCompletedPhaseIds: Set<string>
  messages: string[]
}): Promise<void> {
  const localPath = parseLocalFolderSourceUrl(input.sourceUrl)
  if (!localPath) return

  const sync = await syncBundledOmpsServidorLanToProject({
    projectDirectory: input.projectDirectory,
    payloadSourceDirectory: localPath,
  })
  if (!sync.ok) {
    input.messages.push(`Aviso: ${sync.message}`)
    return
  }
  if (!sync.synced) return

  input.messages.push(sync.message)

  const installRoot = getManagerInstallRoot()
  if (!installRoot) return
  const verified = await verifyBundledOmpsPayloadAtInstallRoot(installRoot)
  if (!verified.ok) return

  const currentSha = verified.verified.contentSha256
  let priorSha: string | null = null
  try {
    const state = JSON.parse(await fs.readFile(getServerManifestStatePath(input.systemId), 'utf8')) as {
      bundledPayloadContentSha256?: string
    }
    priorSha = state.bundledPayloadContentSha256 ?? null
  } catch {
    priorSha = null
  }

  for (const phaseId of LAN_PHASES_RERUN_AFTER_PAYLOAD_SYNC) {
    input.skipCompletedPhaseIds.delete(phaseId)
  }
  if (priorSha != null && priorSha !== currentSha) {
    input.messages.push(
      'Payload OMPS atualizado desde a última tentativa — fases LAN (Caddy/config) serão reexecutadas.',
    )
  } else {
    input.messages.push('Scripts servidor-lan alinhados ao payload — proxy LAN será verificado novamente.')
  }

  try {
    const statePath = getServerManifestStatePath(input.systemId)
    const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as Record<string, unknown>
    state.bundledPayloadContentSha256 = currentSha
    await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  } catch {
    // state ainda não existe — será criado mais adiante
  }
}
