import fs from 'node:fs/promises'
import path from 'node:path'
import { readBundledOmpsFirstRunRecord } from '../bundledOmps/bundledOmpsFirstRunStore.ts'
import { getEffectiveInstallationProgressSnapshot } from './installationProgressReconciliation.ts'
import { isInstallationJobRunning } from './installationJobRunner.ts'
import { isInstallationInProgress } from './installationProgressStore.ts'
import {
  assertValidSystemId,
  getManifestPath,
  getServerManifestStatePath,
  getSystemRoot,
  getSystemsRoot,
} from './paths.ts'
import { readInstallDockerPause } from './installDockerPause.ts'
import type { InstallationSourceKeyProvenance, SourcedInstallationKey } from './installationOriginMatch.ts'
import {
  bundledOmpsInstallationSourceKeys,
  installationSourceKeyFromSourceUrl,
} from './normalizeInstallationSourceKey.ts'

type RawManifest = {
  ok?: boolean
  systemId?: string
  sourceUrl?: string
  installDirectory?: string
  projectDirectory?: string
  installedAt?: string
  runtimePlan?: { packageManager?: string; projectName?: string }
}

export type ManagedInstallationLifecycle =
  | 'completed'
  | 'failed'
  | 'in_progress'
  | 'awaiting_docker'
  | 'interrupted'
  | 'partial'

export type ManagedInstallationRecord = {
  systemId: string
  systemName: string
  repositoryLabel: string
  sourceKeys: string[]
  sourcedKeys: SourcedInstallationKey[]
  installDirectory: string | null
  projectDirectory: string | null
  lifecycle: ManagedInstallationLifecycle
  manifestOk: boolean | null
  manifestStatus: string | null
  progressStatus: string | null
  lastActivityAt: string | null
}

function lifecycleLabel(lifecycle: ManagedInstallationLifecycle): string {
  switch (lifecycle) {
    case 'completed':
      return 'Instalação concluída'
    case 'failed':
      return 'Instalação com falha'
    case 'in_progress':
      return 'Instalação em andamento'
    case 'awaiting_docker':
      return 'Aguardando Docker'
    case 'interrupted':
      return 'Instalação interrompida'
    default:
      return 'Instalação incompleta'
  }
}

export function managedInstallationLifecycleLabel(lifecycle: ManagedInstallationLifecycle): string {
  return lifecycleLabel(lifecycle)
}

async function readRawManifest(systemId: string): Promise<RawManifest | null> {
  try {
    const raw = await fs.readFile(getManifestPath(systemId), 'utf8')
    return JSON.parse(raw) as RawManifest
  } catch {
    return null
  }
}

async function systemDirectoryHasInstallMarkers(systemId: string): Promise<boolean> {
  const root = getSystemRoot(systemId)
  const markers = [
    'installation-manifest.json',
    'install-progress.snapshot.json',
    'server-manifest-state.json',
    'install-docker-pause.json',
    'project',
  ]
  for (const name of markers) {
    try {
      await fs.access(path.join(root, name))
      return true
    } catch {
      // continue
    }
  }
  return false
}

function deriveSourceKeysFromRawSource(sourceUrl: string | null): string[] {
  if (!sourceUrl?.trim()) return []
  try {
    return [installationSourceKeyFromSourceUrl(sourceUrl)]
  } catch {
    return []
  }
}

function addSourcedKey(
  bucket: SourcedInstallationKey[],
  key: string,
  provenance: InstallationSourceKeyProvenance,
): void {
  if (!bucket.some((item) => item.key === key)) {
    bucket.push({ key, provenance })
  }
}

function sourcedKeysFromSourceUrl(
  sourceUrl: string | null,
  provenance: InstallationSourceKeyProvenance,
): SourcedInstallationKey[] {
  const keys = deriveSourceKeysFromRawSource(sourceUrl)
  return keys.map((key) => ({ key, provenance }))
}

function pickSystemName(manifest: RawManifest | null, pausePlanName: string | null): string {
  if (pausePlanName?.trim()) return pausePlanName.trim()
  if (manifest?.runtimePlan && 'projectName' in manifest.runtimePlan) {
    const name = (manifest.runtimePlan as { projectName?: string }).projectName
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  if (manifest?.systemId) return manifest.systemId
  return 'Sistema'
}

function pickRepositoryLabel(sourceUrl: string | null, installDirectory: string | null): string {
  if (sourceUrl?.trim()) {
    if (sourceUrl.startsWith('local-folder:')) {
      return sourceUrl.slice('local-folder:'.length)
    }
    return sourceUrl.trim()
  }
  if (installDirectory) return installDirectory
  return 'Origem não registrada'
}

async function resolveLifecycle(
  systemId: string,
  manifest: RawManifest | null,
  manifestStatus: string | null,
): Promise<{ lifecycle: ManagedInstallationLifecycle; progressStatus: string | null }> {
  const progress = (await getEffectiveInstallationProgressSnapshot(systemId).catch(() => null)) ?? null
  const progressStatus = progress?.status ?? null

  if (isInstallationJobRunning(systemId) || isInstallationInProgress(systemId)) {
    return { lifecycle: 'in_progress', progressStatus: progressStatus ?? 'running' }
  }
  if (progressStatus === 'running') {
    return { lifecycle: 'interrupted', progressStatus }
  }
  if (progressStatus === 'awaiting_docker') {
    return { lifecycle: 'awaiting_docker', progressStatus }
  }
  if (progressStatus === 'interrupted') {
    return { lifecycle: 'interrupted', progressStatus }
  }
  if (progressStatus === 'partial') {
    return { lifecycle: 'partial', progressStatus }
  }
  if (manifest?.ok === true) {
    return { lifecycle: 'completed', progressStatus }
  }
  if (progressStatus === 'failed' || manifest?.ok === false || manifestStatus === 'phases-failed') {
    return { lifecycle: 'failed', progressStatus }
  }
  if (progressStatus === 'succeeded' && manifest?.ok !== true) {
    return { lifecycle: 'partial', progressStatus }
  }
  return { lifecycle: 'partial', progressStatus }
}

async function buildRecordForSystem(systemId: string): Promise<ManagedInstallationRecord | null> {
  const hasMarkers = await systemDirectoryHasInstallMarkers(systemId)
  if (!hasMarkers) return null

  const manifest = await readRawManifest(systemId)
  const pause = await readInstallDockerPause(systemId)

  let manifestStatus: string | null = null
  let stateSourceUrl: string | null = null
  try {
    const stateRaw = await fs.readFile(getServerManifestStatePath(systemId), 'utf8')
    const state = JSON.parse(stateRaw) as { status?: string; sourceUrl?: string }
    manifestStatus = typeof state.status === 'string' ? state.status : null
    stateSourceUrl = typeof state.sourceUrl === 'string' ? state.sourceUrl : null
  } catch {
    // ignore
  }

  const manifestSourceUrl = manifest?.sourceUrl ?? null
  const pauseSourceUrl = pause?.sourceUrl ?? null
  const sourceUrl = manifestSourceUrl ?? pauseSourceUrl ?? stateSourceUrl ?? null

  const sourcedKeys: SourcedInstallationKey[] = []
  for (const item of sourcedKeysFromSourceUrl(manifestSourceUrl, 'manifest')) {
    addSourcedKey(sourcedKeys, item.key, item.provenance)
  }
  for (const item of sourcedKeysFromSourceUrl(stateSourceUrl, 'server_manifest_state')) {
    addSourcedKey(sourcedKeys, item.key, item.provenance)
  }
  for (const item of sourcedKeysFromSourceUrl(pauseSourceUrl, 'docker_pause')) {
    addSourcedKey(sourcedKeys, item.key, item.provenance)
  }

  const bundledFirstRun = await readBundledOmpsFirstRunRecord()
  if (bundledFirstRun?.systemId === systemId && bundledFirstRun.bundleContentSha256) {
    const payloadGuess = sourceUrl?.startsWith('local-folder:')
      ? sourceUrl.slice('local-folder:'.length)
      : null
    if (payloadGuess) {
      for (const key of bundledOmpsInstallationSourceKeys(
        payloadGuess,
        bundledFirstRun.bundleContentSha256,
      )) {
        addSourcedKey(sourcedKeys, key, 'first_run')
      }
    } else {
      const bundledKey = `bundled:${bundledFirstRun.bundleContentSha256.toLowerCase()}`
      addSourcedKey(sourcedKeys, bundledKey, 'first_run')
    }
  }

  const sourceKeys = sourcedKeys.map((item) => item.key)

  const { lifecycle, progressStatus } = await resolveLifecycle(systemId, manifest, manifestStatus)

  const diskProgress = await getEffectiveInstallationProgressSnapshot(systemId).catch(() => null)
  const stat = await fs.stat(getSystemRoot(systemId)).catch(() => null)
  const lastActivityAt =
    diskProgress?.updatedAt ?? manifest?.installedAt ?? stat?.mtime.toISOString() ?? null

  const pausePlanName =
    pause?.plan && typeof pause.plan.projectName === 'string' ? pause.plan.projectName : null

  return {
    systemId,
    systemName: pickSystemName(manifest, pausePlanName),
    repositoryLabel: pickRepositoryLabel(sourceUrl, manifest?.installDirectory ?? null),
    sourceKeys,
    sourcedKeys,
    installDirectory: manifest?.installDirectory ?? getSystemRoot(systemId),
    projectDirectory: manifest?.projectDirectory ?? null,
    lifecycle,
    manifestOk: manifest?.ok === true ? true : manifest?.ok === false ? false : null,
    manifestStatus,
    progressStatus,
    lastActivityAt,
  }
}

export async function enumerateManagedInstallationRecords(): Promise<ManagedInstallationRecord[]> {
  let entries: string[] = []
  try {
    entries = await fs.readdir(getSystemsRoot())
  } catch {
    return []
  }

  const records: ManagedInstallationRecord[] = []
  for (const entry of entries) {
    try {
      assertValidSystemId(entry)
    } catch {
      continue
    }
    const record = await buildRecordForSystem(entry)
    if (record && record.sourceKeys.length > 0) {
      records.push(record)
    } else if (record) {
      // pasta com marcadores mas sem origem — ainda conta como instalação gerenciada pelo systemId
      const fallbackKey = `system:${entry.toLowerCase()}`
      records.push({
        ...record,
        sourceKeys: [fallbackKey],
        sourcedKeys: [{ key: fallbackKey, provenance: 'system_fallback' }],
      })
    }
  }

  return records.sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))
}
