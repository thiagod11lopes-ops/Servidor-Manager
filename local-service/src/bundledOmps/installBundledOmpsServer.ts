import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getManifestPath } from '../installation/paths.ts'
import { parseSystemAccessMode, writeSystemAccessModeConfig } from '../config/systemAccessMode.ts'
import { analyzeProjectFromLocalFolder } from '../projects/analyzeProjectFromLocalFolder.ts'
import { createInstallationPlan } from '../projects/createInstallationPlan.ts'
import { installProject } from '../projects/installProject.ts'
import { encodeLocalFolderSourceUrl } from '../sources/localFolderSource.ts'
import {
  resolveInstallAccessHostForLanMode,
  resolveInstallAccessHostForLocalMode,
} from '../serverManifest/resolveInstallAccessHost.ts'
import {
  loadActiveServidorOmpsFixedLanPolicy,
  verifyServidorOmpsFixedLanHostReady,
} from '../products/servidorOmpsFixedLanRuntime.ts'
import {
  findInstallationDuplicateConflict,
  validateInstallationActionForSourceKeys,
  type InstallationDuplicateConflict,
} from '../installation/installationDuplicateGuard.ts'
import { bundledOmpsInstallationSourceKeys } from '../installation/normalizeInstallationSourceKey.ts'
import { withInstallationSourceLock } from '../installation/installationSourceLock.ts'
import { uninstallManagedSystem } from '../runtime/uninstallManagedSystem.ts'
import { getManagerInstallRoot } from './managerInstallRoot.ts'
import { getSystemRoot } from '../installation/paths.ts'
import { verifyBundledOmpsPayloadAtInstallRoot } from './verifyBundledOmpsPayload.ts'
import {
  clearBundledOmpsFirstRunForSystem,
  readBundledOmpsFirstRunRecord,
  writeBundledOmpsFirstRunStarted,
} from './bundledOmpsFirstRunStore.ts'

export type BundledOmpsInstallDuplicateDecision =
  | { action: 'resume'; systemId: string }
  | { action: 'replace'; systemId: string; confirmReplace: true }
  | { action: 'cancel' }

export type BundledOmpsStatusResponse =
  | {
      ok: true
      available: false
      reason: string
    }
  | {
      ok: true
      available: true
      verified: true
      displayName: string
      ompsVersion: string
      ompsGitSha: string | null
      sourceRevisionKind: string | null
      payloadFileCount: number
      payloadContentSha256: string
      firstRun: {
        systemId: string
        completed: boolean
        accessMode?: 'local' | 'lan'
      } | null
    }

export async function getBundledOmpsServerStatus(): Promise<BundledOmpsStatusResponse> {
  const installRoot = getManagerInstallRoot()
  if (!installRoot) {
    return {
      ok: true,
      available: false,
      reason: 'InstallRoot não definido (inicie o Manager pelo launcher instalado).',
    }
  }

  const verified = await verifyBundledOmpsPayloadAtInstallRoot(installRoot)
  if (!verified.ok) {
    return { ok: true, available: false, reason: verified.reason }
  }

  const { meta, fileCount, contentSha256 } = verified.verified
  const firstRun = await readBundledOmpsFirstRunRecord()
  let firstRunSummary: {
    systemId: string
    completed: boolean
    accessMode?: 'local' | 'lan'
  } | null = null
  if (firstRun) {
    let systemPresent = false
    try {
      await fs.access(getSystemRoot(firstRun.systemId))
      systemPresent = true
    } catch {
      systemPresent = false
    }
    const installMatch = path.resolve(firstRun.installRoot) === path.resolve(installRoot)
    const hashMatch = firstRun.bundleContentSha256 === contentSha256
    if (systemPresent && (installMatch || hashMatch)) {
      firstRunSummary = {
        systemId: firstRun.systemId,
        completed: Boolean(firstRun.completedAt),
        accessMode: firstRun.accessMode,
      }
    }
  }

  return {
    ok: true,
    available: true,
    verified: true,
    displayName: 'AcompOPMS (Servidor)',
    ompsVersion: meta.ompsVersion,
    ompsGitSha: meta.ompsGitSha,
    sourceRevisionKind: meta.sourceRevision?.kind ?? null,
    payloadFileCount: fileCount,
    payloadContentSha256: contentSha256,
    firstRun: firstRunSummary,
  }
}

type BundledOmpsInstallSuccess =
  | { ok: true; accepted: true; systemId: string; message: string }
  | { ok: false; message: string }
  | { ok: false; paused: true; code: 'DOCKER_AWAITING'; message: string; systemId: string }

export type BundledOmpsInstallResponse = BundledOmpsInstallSuccess | InstallationDuplicateConflict

function parseDuplicateDecision(value: unknown): BundledOmpsInstallDuplicateDecision | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const action = item.action
  if (action === 'cancel') return { action: 'cancel' }
  if (action === 'resume' && typeof item.systemId === 'string') {
    return { action: 'resume', systemId: item.systemId.trim() }
  }
  if (
    action === 'replace' &&
    typeof item.systemId === 'string' &&
    item.confirmReplace === true
  ) {
    return { action: 'replace', systemId: item.systemId.trim(), confirmReplace: true }
  }
  return null
}

async function executeBundledOmpsInstallForSystem(input: {
  systemId: string
  installRoot: string
  payloadDirectory: string
  contentSha256: string
  accessMode: 'local' | 'lan'
  lanHost?: string
}): Promise<BundledOmpsInstallSuccess | InstallationDuplicateConflict> {
  const { systemId, installRoot, payloadDirectory, contentSha256, accessMode } = input

  const analyze = await analyzeProjectFromLocalFolder(payloadDirectory)
  if (!analyze.ok) {
    return { ok: false, message: analyze.message }
  }

  const planResult = await createInstallationPlan(
    encodeLocalFolderSourceUrl(payloadDirectory),
    analyze.result,
    systemId,
    payloadDirectory,
  )
  if (!planResult.ok) {
    return { ok: false, message: planResult.message }
  }

  const savedMode = writeSystemAccessModeConfig(systemId, accessMode)
  if (!savedMode.ok) {
    return { ok: false, message: savedMode.message }
  }

  let lanHost =
    typeof input.lanHost === 'string' && input.lanHost.trim().length > 0 ? input.lanHost.trim() : undefined
  let effectiveAccessMode = accessMode
  const overlayEnabled = false

  const fixedLanPolicy = await loadActiveServidorOmpsFixedLanPolicy()
  if (fixedLanPolicy) {
    const hostReady = await verifyServidorOmpsFixedLanHostReady(fixedLanPolicy)
    if (!hostReady.ok) {
      return { ok: false, message: hostReady.message }
    }
    if (fixedLanPolicy.fixed.lanHostMode === 'local') {
      effectiveAccessMode = 'local'
      lanHost = '127.0.0.1'
    } else {
      effectiveAccessMode = 'lan'
      lanHost =
        fixedLanPolicy.fixed.lanHostMode === 'fixed'
          ? fixedLanPolicy.fixed.expectedLanHost
          : 'auto'
    }
  }

  if (effectiveAccessMode === 'local') {
    const resolved = resolveInstallAccessHostForLocalMode()
    if (!resolved.ok) return { ok: false, message: resolved.message }
    lanHost = resolved.host
  } else if (!lanHost || lanHost === 'auto') {
    const resolved = resolveInstallAccessHostForLanMode()
    if (!resolved.ok) return { ok: false, message: resolved.message }
    lanHost = resolved.host
  }

  const response = await installProject({
    systemId,
    localFolderPath: payloadDirectory,
    installationPlan: planResult.plan,
    accessMode: effectiveAccessMode,
    lanHost,
    overlayEnabled,
    skipDuplicateGuard: true,
  })

  if (!response.ok && 'paused' in response && response.paused) {
    return {
      ok: false,
      paused: true,
      code: 'DOCKER_AWAITING',
      message: response.message,
      systemId,
    }
  }

  if (!response.ok && 'code' in response && response.code === 'INSTALLATION_DUPLICATE') {
    return response
  }

  if (!response.ok) {
    return { ok: false, message: 'message' in response ? response.message : 'Falha ao iniciar instalação.' }
  }

  if ('accepted' in response && response.accepted) {
    const firstRunWrite = await writeBundledOmpsFirstRunStarted({
      installRoot,
      bundleContentSha256: contentSha256,
      systemId,
      accessMode,
    })
    if (firstRunWrite.ok && !firstRunWrite.written && firstRunWrite.reason === 'already_points_to_other_system') {
      return {
        ok: false,
        message:
          'O registro global de primeira execução aponta para outra instalação incompleta. Retome ou substitua explicitamente essa instalação antes de continuar.',
      }
    }
    return {
      ok: true,
      accepted: true,
      systemId,
      message: 'Instalação OMPS a partir do payload empacotado iniciada.',
    }
  }

  if ('result' in response && response.result?.ok) {
    const firstRunWrite = await writeBundledOmpsFirstRunStarted({
      installRoot,
      bundleContentSha256: contentSha256,
      systemId,
      accessMode,
    })
    if (firstRunWrite.ok && !firstRunWrite.written && firstRunWrite.reason === 'already_points_to_other_system') {
      return {
        ok: false,
        message:
          'O registro global de primeira execução aponta para outra instalação incompleta. Retome ou substitua explicitamente essa instalação antes de continuar.',
      }
    }
    await markInstallCompleteIfBundled(systemId)
  }

  return {
    ok: true,
    accepted: true,
    systemId,
    message: 'Instalação OMPS concluída.',
  }
}

export async function startBundledOmpsServerInstall(input: {
  accessMode: unknown
  lanHost?: unknown
  duplicateDecision?: unknown
}): Promise<BundledOmpsInstallResponse> {
  const installRoot = getManagerInstallRoot()
  if (!installRoot) {
    return { ok: false, message: 'InstallRoot não definido — use o atalho Servidor OMPS / Manager instalado.' }
  }

  const verified = await verifyBundledOmpsPayloadAtInstallRoot(installRoot)
  if (!verified.ok) {
    return { ok: false, message: verified.reason }
  }

  const accessMode = parseSystemAccessMode(input.accessMode)
  if (!accessMode) {
    return { ok: false, message: 'Selecione modo de acesso: local ou lan.' }
  }

  const decision = parseDuplicateDecision(input.duplicateDecision)
  if (input.duplicateDecision != null && !decision) {
    return { ok: false, message: 'Decisão de instalação duplicada inválida.' }
  }
  if (decision?.action === 'cancel') {
    return { ok: false, message: 'Instalação cancelada — nenhuma alteração foi feita.' }
  }

  const payloadDirectory = verified.verified.payloadDirectory
  const sourceKeys = bundledOmpsInstallationSourceKeys(
    payloadDirectory,
    verified.verified.contentSha256,
  )

  const lanHostInput =
    typeof input.lanHost === 'string' && input.lanHost.trim().length > 0 ? input.lanHost.trim() : undefined

  return withInstallationSourceLock(sourceKeys, async () => {
    if (decision?.action === 'resume' || decision?.action === 'replace') {
      const validated = await validateInstallationActionForSourceKeys({
        systemId: decision.systemId,
        action: decision.action,
        sourceKeys,
      })
      if (!validated.ok) return validated
    }

    if (decision?.action === 'replace') {
      const uninstall = await uninstallManagedSystem(decision.systemId)
      if (!uninstall.ok) {
        return { ok: false, message: uninstall.message }
      }
      await clearBundledOmpsFirstRunForSystem(decision.systemId)
    }

    let systemId: string
    if (decision?.action === 'resume') {
      systemId = decision.systemId
    } else if (decision?.action === 'replace') {
      systemId = crypto.randomUUID()
    } else {
      const conflict = await findInstallationDuplicateConflict({ sourceKeys })
      if (conflict) return conflict
      systemId = crypto.randomUUID()
    }

    const conflictAfterDecision = await findInstallationDuplicateConflict({
      sourceKeys,
      excludeSystemId: decision?.action === 'resume' ? systemId : undefined,
    })
    if (conflictAfterDecision) {
      return conflictAfterDecision
    }

    return executeBundledOmpsInstallForSystem({
      systemId,
      installRoot,
      payloadDirectory,
      contentSha256: verified.verified.contentSha256,
      accessMode,
      lanHost: lanHostInput,
    })
  })
}

export async function markInstallCompleteIfBundled(systemId: string): Promise<void> {
  try {
    const manifestPath = getManifestPath(systemId)
    const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as { ok?: boolean }
    if (raw.ok) {
      await import('./bundledOmpsFirstRunStore.ts').then((m) => m.markBundledOmpsFirstRunCompleted(systemId))
    }
  } catch {
    // best-effort
  }
}
