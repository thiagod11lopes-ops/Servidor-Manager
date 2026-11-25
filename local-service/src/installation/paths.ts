import path from 'node:path'
import { getManagerDataRoot } from './managerDataRoot.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Raiz dos sistemas instalados.
 * Windows (padrão): C:\ServidorManager\systems
 * Linux (padrão): ~/ServidorManager/systems
 * Override: SERVIDOR_MANAGER_SYSTEMS_ROOT
 */
export function getSystemsRoot(): string {
  const fromEnv = process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(getManagerDataRoot(), 'systems')
}

/** Compatibilidade — preferir getSystemsRoot(). */
export function getSystemsRootDisplayPath(): string {
  return getSystemsRoot()
}

/** @deprecated Use getSystemsRoot() — mantido para imports legados; valor resolvido em runtime. */
export const SYSTEMS_ROOT = 'C:\\ServidorManager\\systems'

export function assertValidSystemId(systemId: string): void {
  if (!UUID_RE.test(systemId)) {
    throw new Error('INVALID_SYSTEM_ID')
  }
}

function assertInsideSystemsRoot(resolvedPath: string): void {
  const root = path.resolve(getSystemsRoot())
  const target = path.resolve(resolvedPath)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('INVALID_INSTALL_PATH')
  }
}

export function getSystemRoot(systemId: string): string {
  assertValidSystemId(systemId)
  const target = path.join(getSystemsRoot(), systemId)
  assertInsideSystemsRoot(target)
  return target
}

export function getProjectDirectory(systemId: string): string {
  const target = path.join(getSystemRoot(systemId), 'project')
  assertInsideSystemsRoot(target)
  return target
}

/** Estado do perfil manifest-driven (supabase-local-v1): validação, plano de fases, ref git. */
export function getServerManifestStatePath(systemId: string): string {
  const target = path.join(getSystemRoot(systemId), 'server-manifest-state.json')
  assertInsideSystemsRoot(target)
  return target
}

export function getManifestPath(systemId: string): string {
  const target = path.join(getSystemRoot(systemId), 'installation-manifest.json')
  assertInsideSystemsRoot(target)
  return target
}
