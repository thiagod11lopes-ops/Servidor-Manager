import fs from 'node:fs/promises'
import path from 'node:path'
import { getSystemRoot } from './paths.ts'
import type { InstallationProgressSnapshot } from './installationProgressStore.ts'

export function getInstallationProgressSnapshotPath(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'install-progress.snapshot.json')
}

/** Evita gravações concorrentes no mesmo snapshot (JSON truncado/corrompido). */
const persistWriteChains = new Map<string, Promise<void>>()

export async function drainInstallationProgressWrites(systemId: string): Promise<void> {
  await (persistWriteChains.get(systemId) ?? Promise.resolve())
}

function enqueueInstallationProgressWrite(systemId: string, task: () => Promise<void>): void {
  const previous = persistWriteChains.get(systemId) ?? Promise.resolve()
  const next = previous.then(task, task).catch(() => {
    // falha de disco não deve quebrar a cadeia das gravações seguintes
  })
  persistWriteChains.set(systemId, next)
}

export async function persistInstallationProgressSnapshot(
  snapshot: InstallationProgressSnapshot,
): Promise<void> {
  const filePath = getInstallationProgressSnapshotPath(snapshot.systemId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const payload = JSON.stringify(snapshot, null, 2)
  const tmpPath = `${filePath}.${process.pid}.tmp`
  await fs.writeFile(tmpPath, payload, 'utf8')
  await fs.rename(tmpPath, filePath)
}

export function scheduleInstallationProgressSnapshot(
  snapshot: InstallationProgressSnapshot,
): void {
  enqueueInstallationProgressWrite(snapshot.systemId, () => persistInstallationProgressSnapshot(snapshot))
}

export async function loadInstallationProgressSnapshot(
  systemId: string,
): Promise<InstallationProgressSnapshot | null> {
  try {
    const raw = await fs.readFile(getInstallationProgressSnapshotPath(systemId), 'utf8')
    const parsed = JSON.parse(raw) as InstallationProgressSnapshot
    if (!parsed || parsed.systemId !== systemId || !Array.isArray(parsed.phases)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function clearInstallationProgressSnapshot(systemId: string): Promise<void> {
  try {
    await fs.unlink(getInstallationProgressSnapshotPath(systemId))
  } catch {
    // ignore
  }
}
