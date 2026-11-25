import path from 'node:path'
import { getBrowserUploadStagingRoot, getManagerDataRoot } from '../installation/managerDataRoot.ts'

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPathInsideRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return (
    resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
  )
}

export function isBrowserUploadSessionPath(absPath: string): boolean {
  const stagingRoot = path.resolve(getBrowserUploadStagingRoot())
  const target = path.resolve(absPath)
  if (!isPathInsideRoot(stagingRoot, target)) return false
  const relative = path.relative(stagingRoot, target)
  if (!relative || relative === '.' || relative.startsWith(`..${path.sep}`)) return false
  const sessionId = relative.split(path.sep)[0]
  return SESSION_ID_RE.test(sessionId)
}

/**
 * Impede que a API leia pastas internas do Manager (systems, config, etc.)
 * salvo sessões de upload criadas pelo próprio serviço.
 */
export function assertLocalFolderPathAllowed(absPath: string): { ok: true } | { ok: false; code: string } {
  const managerRoot = path.resolve(getManagerDataRoot())
  if (!isPathInsideRoot(managerRoot, absPath)) {
    return { ok: true }
  }
  if (isBrowserUploadSessionPath(absPath)) {
    return { ok: true }
  }
  return { ok: false, code: 'LOCAL_PATH_FORBIDDEN' }
}

export function assertValidBrowserUploadSessionId(uploadId: unknown): uploadId is string {
  return typeof uploadId === 'string' && SESSION_ID_RE.test(uploadId.trim())
}
