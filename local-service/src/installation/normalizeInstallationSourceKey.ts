import {
  encodeLocalFolderSourceUrl,
  isLocalFolderSourceUrl,
  normalizeLocalFolderPath,
  parseLocalFolderSourceUrl,
} from '../sources/localFolderSource.ts'
import { normalizeGitRemoteUrl, validateSourceUrl } from '../sources/validateSourceUrl.ts'

/** Chave estável para comparar origens equivalentes (Git, pasta local ou pacote OMPS). */
export function installationSourceKeyFromSourceUrl(sourceUrl: string): string {
  const trimmed = sourceUrl.trim()
  if (isLocalFolderSourceUrl(trimmed)) {
    const folder = parseLocalFolderSourceUrl(trimmed)
    if (!folder) throw new Error('INVALID_LOCAL_SOURCE')
    return `local:${normalizeLocalFolderPath(folder)}`
  }
  return `git:${normalizeGitRemoteUrl(validateSourceUrl(trimmed))}`
}

export function installationSourceKeyFromLocalFolderPath(absolutePath: string): string {
  return installationSourceKeyFromSourceUrl(encodeLocalFolderSourceUrl(absolutePath))
}

export function bundledOmpsInstallationSourceKeys(
  payloadDirectory: string,
  payloadContentSha256: string,
): string[] {
  const sha = payloadContentSha256.trim().toLowerCase()
  const localKey = installationSourceKeyFromLocalFolderPath(payloadDirectory)
  const keys = new Set<string>([`bundled:${sha}`, localKey])
  return [...keys]
}

export function installationSourceKeysMatch(a: string, b: string): boolean {
  return a === b
}

export function recordMatchesAnySourceKey(recordKeys: string[], targetKeys: string[]): boolean {
  const target = new Set(targetKeys)
  return recordKeys.some((key) => target.has(key))
}
