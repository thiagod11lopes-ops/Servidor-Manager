import fs from 'node:fs/promises'
import path from 'node:path'
import { assertLocalFolderPathAllowed } from './localFolderAccessPolicy.ts'

export const LOCAL_FOLDER_SOURCE_PREFIX = 'local-folder:'

export function encodeLocalFolderSourceUrl(absolutePath: string): string {
  return `${LOCAL_FOLDER_SOURCE_PREFIX}${absolutePath}`
}

export function parseLocalFolderSourceUrl(sourceUrl: string): string | null {
  if (!sourceUrl.startsWith(LOCAL_FOLDER_SOURCE_PREFIX)) return null
  const raw = sourceUrl.slice(LOCAL_FOLDER_SOURCE_PREFIX.length).trim()
  return raw.length > 0 ? raw : null
}

export function isLocalFolderSourceUrl(sourceUrl: string): boolean {
  return parseLocalFolderSourceUrl(sourceUrl) !== null
}

/** Caminho absoluto normalizado para comparação (Windows: case-insensitive). */
export function normalizeLocalFolderPath(rawPath: string): string {
  const resolved = path.resolve(rawPath.trim())
  if (process.platform === 'win32') {
    return resolved.replace(/\//g, '\\').toLowerCase()
  }
  return resolved
}

export type ValidatedLocalFolder =
  | { ok: true; absolutePath: string; projectRoot: string }
  | { ok: false; code: string }

export function localProjectFolderErrorMessage(code: string): string {
  switch (code) {
    case 'INVALID_LOCAL_PATH':
      return 'Informe uma pasta local válida.'
    case 'LOCAL_PATH_NOT_FOUND':
      return 'A pasta selecionada não existe ou não está acessível neste computador.'
    case 'LOCAL_PATH_NOT_DIRECTORY':
      return 'O caminho informado não é uma pasta.'
    case 'LOCAL_PATH_NOT_READABLE':
      return 'Não foi possível ler a pasta selecionada. Verifique permissões.'
    case 'LOCAL_PATH_FORBIDDEN':
      return 'Esta pasta não pode ser usada como origem (caminho interno do Servidor Manager).'
    case 'LOCAL_PROJECT_STRUCTURE_MISSING':
      return 'A pasta não contém um projeto reconhecível (server-manifest.json ou package.json na raiz).'
    default:
      return 'Não foi possível usar a pasta local informada.'
  }
}

export async function validateLocalProjectFolder(rawPath: unknown): Promise<ValidatedLocalFolder> {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return { ok: false, code: 'INVALID_LOCAL_PATH' }
  }
  if (rawPath.includes('\0')) {
    return { ok: false, code: 'INVALID_LOCAL_PATH' }
  }

  let absolutePath: string
  try {
    absolutePath = path.resolve(rawPath.trim())
  } catch {
    return { ok: false, code: 'INVALID_LOCAL_PATH' }
  }

  let stat
  try {
    stat = await fs.stat(absolutePath)
  } catch {
    return { ok: false, code: 'LOCAL_PATH_NOT_FOUND' }
  }

  if (!stat.isDirectory()) {
    return { ok: false, code: 'LOCAL_PATH_NOT_DIRECTORY' }
  }

  const allowed = assertLocalFolderPathAllowed(absolutePath)
  if (!allowed.ok) {
    return { ok: false, code: allowed.code }
  }

  try {
    await fs.access(absolutePath, fs.constants.R_OK)
  } catch {
    return { ok: false, code: 'LOCAL_PATH_NOT_READABLE' }
  }

  const { resolveProjectRoot } = await import('../analysis/analyzeProjectTree.ts')
  const projectRoot = await resolveProjectRoot(absolutePath)

  const manifestPath = path.join(projectRoot, 'server-manifest.json')
  const packageJsonPath = path.join(projectRoot, 'package.json')
  const hasManifest = await pathExists(manifestPath)
  const hasPackageJson = await pathExists(packageJsonPath)

  if (!hasManifest && !hasPackageJson) {
    return { ok: false, code: 'LOCAL_PROJECT_STRUCTURE_MISSING' }
  }

  return { ok: true, absolutePath, projectRoot }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}
