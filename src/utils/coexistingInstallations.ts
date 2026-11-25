import { groupSystemsBySourceUrl, normalizeSystemSourceUrl } from './systemUrlKey.ts'

export type CatalogSystemRef = {
  id: string
  name: string
  url: string
  status?: string
}

/** Vários cadastros apontando para o mesmo repositório Git (URLs normalizadas). */
export function listSharedSourceUrlGroups<T extends CatalogSystemRef>(systems: T[]): T[][] {
  const groups = groupSystemsBySourceUrl(systems)
  return [...groups.values()].filter((group) => group.length > 1)
}

/** Mesmo nome de exibição (case-insensitive) em systemIds diferentes — permitido, mas confuso na UI. */
export function listSharedDisplayNameGroups<T extends CatalogSystemRef>(systems: T[]): T[][] {
  const byName = new Map<string, T[]>()
  for (const system of systems) {
    const key = system.name.trim().toLowerCase()
    if (!key) continue
    const list = byName.get(key) ?? []
    list.push(system)
    byName.set(key, list)
  }
  return [...byName.values()].filter((group) => group.length > 1)
}

export function sharedSourceUrlLabel(url: string): string {
  return normalizeSystemSourceUrl(url) || url.trim()
}

/**
 * Mesclar instalações descobertas no disco ao catálogo local.
 * Várias instalações do mesmo repositório Git são válidas (UUID distintos).
 */
export function mergeDiscoveredSystemsIntoCatalog(
  current: CatalogSystemRef[],
  discovered: Array<{ systemId: string; sourceUrl: string | null; installedAt: string | null }>,
  displayNameFromUrl: (sourceUrl: string | null, systemId: string) => string,
): { systems: CatalogSystemRef[]; changed: boolean } {
  const byId = new Map(current.map((item) => [item.id, item]))
  let changed = false

  for (const row of discovered) {
    if (byId.has(row.systemId)) continue
    const url = row.sourceUrl ?? ''
    byId.set(row.systemId, {
      id: row.systemId,
      name: displayNameFromUrl(row.sourceUrl, row.systemId),
      url,
      status: 'instalado',
    })
    changed = true
  }

  if (!changed) {
    return { systems: current, changed: false }
  }

  return { systems: [...byId.values()], changed: true }
}
