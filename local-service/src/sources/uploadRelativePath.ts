import { shouldSkipBrowserUploadPath } from '../../../shared/browserUploadPathFilter.ts'

export type SanitizedRelativePath =
  | { ok: true; relativePath: string }
  | { ok: false; code: string }

/** Valida caminho relativo enviado pelo navegador (sem traversal nem absolutos). */
export function sanitizeUploadRelativePath(raw: unknown): SanitizedRelativePath {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, code: 'INVALID_UPLOAD_PATH' }
  }
  if (raw.includes('\0')) {
    return { ok: false, code: 'INVALID_UPLOAD_PATH' }
  }

  let normalized = raw.replace(/\\/g, '/').trim()
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }
  if (normalized.startsWith('/')) {
    return { ok: false, code: 'INVALID_UPLOAD_PATH' }
  }
  if (/^[a-zA-Z]:/.test(normalized)) {
    return { ok: false, code: 'INVALID_UPLOAD_PATH' }
  }

  const segments = normalized.split('/').filter((segment) => segment.length > 0)
  for (const segment of segments) {
    if (segment === '..') {
      return { ok: false, code: 'INVALID_UPLOAD_PATH' }
    }
    if (segment === '.' || segment.includes('\\')) {
      return { ok: false, code: 'INVALID_UPLOAD_PATH' }
    }
  }

  if (segments.length === 0) {
    return { ok: false, code: 'INVALID_UPLOAD_PATH' }
  }

  const relativePath = segments.join('/')

  if (shouldSkipBrowserUploadPath(relativePath, 'file')) {
    return { ok: false, code: 'UPLOAD_PATH_SKIPPED' }
  }

  if (relativePath.length > 240) {
    return { ok: false, code: 'INVALID_UPLOAD_PATH' }
  }

  return { ok: true, relativePath }
}
