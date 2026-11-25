import fs from 'node:fs/promises'
import { assertValidSystemId, getManifestPath, getServerManifestStatePath, getSystemsRoot } from '../installation/paths.ts'

type ManifestFile = {
  systemId?: string
  ok?: boolean
  sourceUrl?: string
  projectDirectory?: string
  messages?: string[]
  serverManifestProfile?: string
  serverConnection?: { loginUrl?: string }
  runtimePlan?: { packageManager?: string; identifiedPorts?: number[] }
}

function parseSourceUrl(manifest: ManifestFile): string | null {
  if (typeof manifest.sourceUrl === 'string' && manifest.sourceUrl.trim()) {
    return manifest.sourceUrl.trim()
  }
  if (!manifest.messages) return null
  for (const line of manifest.messages) {
    const match = /https:\/\/github\.com\/[^\s)]+\.git/i.exec(line)
    if (match) return match[0].replace(/\.git$/i, '')
    const match2 = /https:\/\/github\.com\/[^\s)]+/i.exec(line)
    if (match2) return match2[0]
  }
  return null
}

export type DiscoveredInstalledSystem = {
  systemId: string
  sourceUrl: string | null
  projectDirectory: string | null
  installedAt: string | null
  serverManifestProfile: string | null
  packageManager: string | null
  httpPort: number | null
  loginUrl: string | null
  /** Código estável do banco (BNC01, BNC02, …). */
  databaseNumber: string | null
}

export async function collectDiscoveredInstalledSystems(): Promise<DiscoveredInstalledSystem[]> {
  let entries: string[] = []
  try {
    entries = await fs.readdir(getSystemsRoot())
  } catch {
    return []
  }

  const discovered: DiscoveredInstalledSystem[] = []

  for (const entry of entries) {
    try {
      assertValidSystemId(entry)
    } catch {
      continue
    }

    const manifestPath = getManifestPath(entry)
    let raw: string
    try {
      raw = await fs.readFile(manifestPath, 'utf8')
    } catch {
      continue
    }

    let manifest: ManifestFile
    try {
      manifest = JSON.parse(raw) as ManifestFile
    } catch {
      continue
    }

    if (!manifest.ok) continue

    const stat = await fs.stat(manifestPath)

    let loginUrl = manifest.serverConnection?.loginUrl ?? null
    if (!loginUrl) {
      try {
        const stateRaw = await fs.readFile(getServerManifestStatePath(entry), 'utf8')
        const state = JSON.parse(stateRaw) as { serverConnection?: { loginUrl?: string } }
        loginUrl = state.serverConnection?.loginUrl ?? null
      } catch {
        // ignore
      }
    }

    const ports = manifest.runtimePlan?.identifiedPorts ?? []
    discovered.push({
      systemId: entry,
      sourceUrl: parseSourceUrl(manifest),
      projectDirectory: manifest.projectDirectory ?? null,
      installedAt: stat.mtime.toISOString(),
      serverManifestProfile: manifest.serverManifestProfile ?? null,
      packageManager: manifest.runtimePlan?.packageManager ?? null,
      httpPort: ports[0] ?? null,
      loginUrl,
      databaseNumber: null,
    })
  }

  return discovered.sort((a, b) => (b.installedAt ?? '').localeCompare(a.installedAt ?? ''))
}

export async function discoverInstalledSystems(): Promise<DiscoveredInstalledSystem[]> {
  const sorted = await collectDiscoveredInstalledSystems()

  const { syncDatabaseNumberRegistry } = await import('./databaseNumberRegistry.ts')
  const assignments = await syncDatabaseNumberRegistry(
    sorted.map((item) => ({ systemId: item.systemId, installedAt: item.installedAt })),
  )

  const enriched = sorted.map((item) => ({
    ...item,
    databaseNumber: assignments[item.systemId] ?? null,
  }))

  const { reconcileSystemDatabaseNumbers } = await import('./reconcileSystemDatabaseNumbers.ts')
  void reconcileSystemDatabaseNumbers(enriched, assignments).catch(() => {
    // best-effort — UI/API still returns codes from registry
  })

  return enriched
}
