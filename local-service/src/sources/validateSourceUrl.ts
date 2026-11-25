const MAX_URL_LENGTH = 2048

function sanitizeSourceUrlInput(sourceUrl: string): string {
  let trimmed = sourceUrl.trim().replace(/[\u200B-\u200D\uFEFF]/g, '')
  trimmed = trimmed.replace(/^["'`]+|["'`]+$/g, '')
  if (!trimmed) return trimmed
  if (!/^https?:\/\//i.test(trimmed) && /^[\w.-@]+\//.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

export function validateSourceUrl(sourceUrl: string): URL {
  const trimmed = sanitizeSourceUrlInput(sourceUrl)
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) {
    throw new Error('INVALID_SOURCE_URL')
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('INVALID_SOURCE_URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('INVALID_SOURCE_URL')
  }

  if (url.username || url.password) {
    throw new Error('INVALID_SOURCE_URL')
  }

  if (!url.hostname) {
    throw new Error('INVALID_SOURCE_URL')
  }

  return url
}

function gitRemoteFromGitHubPages(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  const ownerMatch = host.match(/^([a-z0-9-]+)\.github\.io$/i)
  if (!ownerMatch) return null

  const owner = ownerMatch[1]
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length === 0) return null

  const repo = parts[0].replace(/\.git$/i, '')
  if (!repo) return null

  return `https://github.com/${owner}/${repo}.git`
}

export function isGitHubPagesSiteUrl(sourceUrl: string): boolean {
  try {
    const url = validateSourceUrl(sourceUrl)
    return url.hostname.toLowerCase().endsWith('.github.io')
  } catch {
    return false
  }
}

const SAFE_GIT_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/

function isSafeGitRef(ref: string): boolean {
  return SAFE_GIT_REF.test(ref) && !ref.includes('..') && !ref.endsWith('/') && !ref.endsWith('.lock')
}

/**
 * Extrai branch/tag de URLs como `https://github.com/owner/repo/tree/minha/branch`.
 * Necessário enquanto `server-manifest.json` existir só em branch (ex.: PR) e não na padrão.
 */
export function extractGitRef(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)

  let ref: string | null = null
  if ((host === 'github.com' || host === 'www.github.com') && parts.length >= 4 && parts[2] === 'tree') {
    ref = decodeURIComponent(parts.slice(3).join('/'))
  } else if (host === 'gitlab.com' || host === 'www.gitlab.com') {
    const marker = parts.indexOf('-')
    if (marker !== -1 && parts[marker + 1] === 'tree' && parts.length > marker + 2) {
      ref = decodeURIComponent(parts.slice(marker + 2).join('/'))
    }
  }

  if (!ref) return null
  if (!isSafeGitRef(ref)) throw new Error('INVALID_SOURCE_URL')
  return ref
}

/** Argumentos extras do `git clone` para a ref da URL (se houver). */
export function gitCloneRefArgs(sourceUrl: string): string[] {
  const ref = extractGitRef(validateSourceUrl(sourceUrl))
  return ref ? ['--branch', ref] : []
}

export function normalizeGitRemoteUrl(url: URL): string {
  const host = url.hostname.toLowerCase()

  const fromPages = gitRemoteFromGitHubPages(url)
  if (fromPages) return fromPages

  if (host === 'github.com' || host === 'www.github.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length >= 2) {
      const owner = parts[0]
      const repo = parts[1].replace(/\.git$/i, '')
      return `https://github.com/${owner}/${repo}.git`
    }
  }

  if (host === 'gitlab.com' || host === 'www.gitlab.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length >= 2) {
      const projectPath = parts.join('/').replace(/\.git$/i, '')
      return `https://gitlab.com/${projectPath}.git`
    }
  }

  return url.toString()
}
