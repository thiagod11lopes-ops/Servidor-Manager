/** Remove caracteres invisíveis e aspas ao colar do chat/navegador. */
export function sanitizeSourceUrlInput(raw: string): string {
  let trimmed = raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, '')
  trimmed = trimmed.replace(/^["'`]+|["'`]+$/g, '')
  if (!trimmed) return trimmed
  if (!/^https?:\/\//i.test(trimmed) && /^[\w.-@]+\//.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

export function isValidSourceUrlInput(raw: string): boolean {
  const normalized = normalizeUserSourceUrl(sanitizeSourceUrlInput(raw))
  if (!normalized) return false
  try {
    const url = new URL(normalized)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Converte GitHub Pages → repositório Git (mesma regra do local-service). */
export function normalizeUserSourceUrl(raw: string): string {
  const trimmed = sanitizeSourceUrlInput(raw)
  if (!trimmed) return trimmed

  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase()

    const pagesOwner = host.match(/^([a-z0-9-]+)\.github\.io$/i)
    if (pagesOwner) {
      const repo = url.pathname.split('/').filter(Boolean)[0]?.replace(/\.git$/i, '')
      if (repo) return `https://github.com/${pagesOwner[1]}/${repo}`
    }

    if (host === 'github.com' || host === 'www.github.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length >= 2) {
        const owner = parts[0]
        const repo = parts[1].replace(/\.git$/i, '')
        // Mantém /tree/<branch> (ex.: server-manifest só em branch até merge na main).
        if (parts[2] === 'tree' && parts.length >= 4) {
          return `https://github.com/${owner}/${repo}/tree/${parts.slice(3).join('/')}`
        }
        return `https://github.com/${owner}/${repo}`
      }
    }
  } catch {
    return trimmed
  }

  return trimmed
}
