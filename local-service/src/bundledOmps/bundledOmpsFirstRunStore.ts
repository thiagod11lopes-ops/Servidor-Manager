import fs from 'node:fs/promises'
import path from 'node:path'
import { getManagerDataRoot } from '../installation/managerDataRoot.ts'

const STORE_SCHEMA = 'servidor-omps-first-run/1'
const CONFIG_FILE = 'servidor-omps-first-run.json'

export type BundledOmpsFirstRunRecord = {
  schema: typeof STORE_SCHEMA
  installRoot: string
  bundleContentSha256: string
  systemId: string
  startedAt: string
  completedAt?: string
  accessMode?: 'local' | 'lan'
}

function configPath(): string {
  return path.join(getManagerDataRoot(), 'config', CONFIG_FILE)
}

export async function readBundledOmpsFirstRunRecord(): Promise<BundledOmpsFirstRunRecord | null> {
  try {
    const raw = JSON.parse(await fs.readFile(configPath(), 'utf8')) as BundledOmpsFirstRunRecord
    if (raw.schema !== STORE_SCHEMA) return null
    return raw
  } catch {
    return null
  }
}

export type WriteBundledOmpsFirstRunStartedResult =
  | { ok: true; written: true }
  | { ok: true; written: false; reason: 'already_points_to_other_system' }
  | { ok: false; reason: 'invalid_input' }

export async function writeBundledOmpsFirstRunStarted(input: {
  installRoot: string
  bundleContentSha256: string
  systemId: string
  accessMode: 'local' | 'lan'
}): Promise<WriteBundledOmpsFirstRunStartedResult> {
  const current = await readBundledOmpsFirstRunRecord()
  if (current && !current.completedAt && current.systemId !== input.systemId) {
    return { ok: true, written: false, reason: 'already_points_to_other_system' }
  }

  const dir = path.dirname(configPath())
  await fs.mkdir(dir, { recursive: true })
  const record: BundledOmpsFirstRunRecord = {
    schema: STORE_SCHEMA,
    installRoot: path.resolve(input.installRoot),
    bundleContentSha256: input.bundleContentSha256,
    systemId: input.systemId,
    startedAt: new Date().toISOString(),
    accessMode: input.accessMode,
  }
  await fs.writeFile(configPath(), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  return { ok: true, written: true }
}

export async function markBundledOmpsFirstRunCompleted(systemId: string): Promise<void> {
  const current = await readBundledOmpsFirstRunRecord()
  if (!current || current.systemId !== systemId) return
  await fs.writeFile(
    configPath(),
    `${JSON.stringify({ ...current, completedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
}

/** Atualiza InstallRoot/hash do payload quando o Manager mudou de pasta ou o bundle foi atualizado. */
export async function updateBundledOmpsFirstRunInstallBinding(input: {
  installRoot: string
  bundleContentSha256: string
}): Promise<void> {
  const current = await readBundledOmpsFirstRunRecord()
  if (!current) return
  const resolvedInstall = path.resolve(input.installRoot)
  const resolvedHash = input.bundleContentSha256.trim()
  if (
    path.resolve(current.installRoot) === resolvedInstall &&
    current.bundleContentSha256 === resolvedHash
  ) {
    return
  }
  await fs.writeFile(
    configPath(),
    `${JSON.stringify(
      {
        ...current,
        installRoot: resolvedInstall,
        bundleContentSha256: resolvedHash,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

export async function clearBundledOmpsFirstRunForSystem(systemId: string): Promise<void> {
  const current = await readBundledOmpsFirstRunRecord()
  if (!current || current.systemId !== systemId) return
  try {
    await fs.unlink(configPath())
  } catch {
    // ignore
  }
}
