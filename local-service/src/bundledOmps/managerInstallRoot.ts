import path from 'node:path'

/** Raiz do Manager instalado (%LOCALAPPDATA%\\Programs\\...), definida pelo launcher. */
export function getManagerInstallRoot(): string | null {
  const explicit = process.env.SERVIDOR_MANAGER_INSTALL_ROOT?.trim()
  if (explicit) return path.resolve(explicit)
  const resources = process.env.SM_RESOURCES_PATH?.trim()
  if (resources) return path.resolve(path.dirname(resources))
  return null
}

export function resolveBundledPayloadDirectory(installRoot: string): string {
  return path.join(installRoot, 'resources', 'omps-payload')
}

export function resolveBundledMetaFilePath(installRoot: string): string {
  return path.join(installRoot, 'resources', 'omps-bundle', 'bundle-meta.json')
}
