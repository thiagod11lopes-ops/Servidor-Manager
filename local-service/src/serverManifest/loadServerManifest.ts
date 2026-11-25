import fs from 'node:fs/promises'
import path from 'node:path'
import {
  SERVER_MANIFEST_FILE,
  SUPPORTED_BACKEND_PROFILE,
  type LoadServerManifestResult,
  type ServerManifest,
} from './types.ts'

function isInsideRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
}

/**
 * Procura `server-manifest.json` na raiz do clone (etapa 2).
 * Nunca assume que a branch padrão contém o arquivo.
 */
export async function loadServerManifest(rootDirectory: string): Promise<LoadServerManifestResult> {
  const defaultPath = path.join(rootDirectory, SERVER_MANIFEST_FILE)

  let raw: string
  try {
    raw = await fs.readFile(defaultPath, 'utf8')
  } catch {
    return { found: false }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      found: true,
      ok: false,
      manifestPath: defaultPath,
      error: `${SERVER_MANIFEST_FILE} não é um JSON válido.`,
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      found: true,
      ok: false,
      manifestPath: defaultPath,
      error: `${SERVER_MANIFEST_FILE} deve ser um objeto JSON.`,
    }
  }

  const manifest = parsed as ServerManifest
  const declaredPath = manifest.manager?.manifestPath
  if (declaredPath && declaredPath !== SERVER_MANIFEST_FILE) {
    const alternative = path.resolve(rootDirectory, declaredPath)
    if (!isInsideRoot(rootDirectory, alternative)) {
      return {
        found: true,
        ok: false,
        manifestPath: defaultPath,
        error: 'manager.manifestPath aponta para fora do repositório clonado.',
      }
    }
  }

  return { found: true, ok: true, manifest, manifestPath: defaultPath, rootDirectory }
}

export function isSupportedProfile(manifest: ServerManifest): boolean {
  return manifest.manager?.backendProfile === SUPPORTED_BACKEND_PROFILE
}

/**
 * True quando `directory` (ou o pai, caso o diretório de trabalho seja `frontend/`) pertence a um clone
 * com manifesto `supabase-local-v1`. Usado para não cair no fluxo genérico `npm run preview` (:4173).
 */
export async function directoryUsesManifestProfile(directory: string): Promise<boolean> {
  for (const candidate of [directory, path.dirname(directory)]) {
    const loaded = await loadServerManifest(candidate)
    if (loaded.found && loaded.ok && isSupportedProfile(loaded.manifest)) return true
  }
  return false
}
