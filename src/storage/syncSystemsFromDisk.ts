import { getLocalServiceBaseUrl } from '../services/localServiceConfig.ts'
import type { ManagedSystem } from '../types/system.ts'
import { mergeDiscoveredSystemsIntoCatalog } from '../utils/coexistingInstallations.ts'
import { loadSystems, saveSystems } from './systemsStorage.ts'

type DiscoveredRow = {
  systemId: string
  sourceUrl: string | null
  projectDirectory: string | null
  installedAt: string | null
}

function displayNameFromUrl(sourceUrl: string | null, systemId: string): string {
  if (sourceUrl) {
    try {
      const parts = new URL(sourceUrl).pathname.split('/').filter(Boolean)
      const repo = parts[parts.length - 1]
      if (repo) return repo
    } catch {
      // ignore
    }
  }
  return `Sistema ${systemId.slice(0, 8)}`
}

export async function syncSystemsFromDisk(): Promise<ManagedSystem[]> {
  const current = loadSystems()
  const baseUrl = getLocalServiceBaseUrl()

  let discovered: DiscoveredRow[] = []
  try {
    const response = await fetch(`${baseUrl}/api/v1/systems/discovered`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return current
    const payload = (await response.json()) as { systems?: DiscoveredRow[] }
    discovered = payload.systems ?? []
  } catch {
    return current
  }

  const { systems: mergedRefs, changed } = mergeDiscoveredSystemsIntoCatalog(
    current,
    discovered,
    displayNameFromUrl,
  )

  if (!changed) return current

  const merged: ManagedSystem[] = mergedRefs.map((row) => {
    const existing = current.find((item) => item.id === row.id)
    if (existing) return existing
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      status: 'instalado',
      technology: 'analisada',
      createdAt:
        discovered.find((d) => d.systemId === row.id)?.installedAt ?? new Date().toISOString(),
    }
  })

  merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  saveSystems(merged)
  return merged
}
