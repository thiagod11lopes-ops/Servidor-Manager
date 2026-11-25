import fs from 'node:fs/promises'
import path from 'node:path'
import { getManagerInstallRoot } from './managerInstallRoot.ts'
import {
  isTrustedBundledOmpsPayloadDirectory,
  verifyBundledOmpsPayloadAtInstallRoot,
} from './verifyBundledOmpsPayload.ts'

const SERVIDOR_LAN_REL = path.join('Transferir para Servidor', 'servidor-lan')

export type SyncBundledServidorLanResult =
  | { ok: true; synced: false; reason: string }
  | { ok: true; synced: true; payloadSha256: string; message: string }
  | { ok: false; message: string }

/**
 * Copia servidor-lan do payload empacotado (InstallRoot) para o clone em project/,
 * evitando retomadas com scripts LAN desatualizados após atualizar o Manager/OMPS.
 */
export async function syncBundledOmpsServidorLanToProject(input: {
  projectDirectory: string
  payloadSourceDirectory: string
}): Promise<SyncBundledServidorLanResult> {
  const trusted = await isTrustedBundledOmpsPayloadDirectory(input.payloadSourceDirectory)
  if (!trusted) {
    return { ok: true, synced: false, reason: 'Origem não é o payload OMPS verificado do InstallRoot.' }
  }

  const installRoot = getManagerInstallRoot()
  if (!installRoot) {
    return { ok: false, message: 'InstallRoot do Manager não disponível para sincronizar servidor-lan.' }
  }

  const verified = await verifyBundledOmpsPayloadAtInstallRoot(installRoot)
  if (!verified.ok) {
    return { ok: false, message: verified.reason }
  }

  const payloadLan = path.join(verified.verified.payloadDirectory, SERVIDOR_LAN_REL)
  const projectLan = path.join(input.projectDirectory, SERVIDOR_LAN_REL)

  try {
    await fs.access(payloadLan)
  } catch {
    return { ok: false, message: `Payload OMPS sem pasta servidor-lan: ${payloadLan}` }
  }

  await fs.mkdir(path.dirname(projectLan), { recursive: true })
  await fs.cp(payloadLan, projectLan, { recursive: true, force: true })

  return {
    ok: true,
    synced: true,
    payloadSha256: verified.verified.contentSha256,
    message: `servidor-lan sincronizado do payload OMPS (SHA256 ${verified.verified.contentSha256.slice(0, 12)}…).`,
  }
}
