export function normalizeSystemSourceUrl(url: string): string {
  return url
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

type SystemWithSource = {
  url: string
  sourceKind?: 'git' | 'localFolder'
  localFolderPath?: string
}

function systemSourceGroupKey(system: SystemWithSource): string {
  if (system.sourceKind === 'localFolder' && system.localFolderPath?.trim()) {
    return `local:${system.localFolderPath.trim().toLowerCase()}`
  }
  return normalizeSystemSourceUrl(system.url) || system.url.trim()
}

export function groupSystemsBySourceUrl<T extends SystemWithSource>(
  systems: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const system of systems) {
    const key = systemSourceGroupKey(system)
    const list = groups.get(key) ?? []
    list.push(system)
    groups.set(key, list)
  }
  return groups
}
