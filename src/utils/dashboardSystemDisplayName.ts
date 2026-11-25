export function dashboardSystemDisplayName(sourceUrl: string | null, systemId: string): string {
  if (sourceUrl) {
    try {
      const parts = new URL(sourceUrl).pathname.split('/').filter(Boolean)
      const repo = parts[parts.length - 1]
      if (repo) return repo.replace(/\.git$/i, '')
    } catch {
      // ignore
    }
  }
  return `Sistema ${systemId.slice(0, 8)}`
}
