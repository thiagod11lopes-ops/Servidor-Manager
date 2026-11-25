import {
  encodeLocalFolderSourceUrl,
  isLocalFolderSourceUrl,
  localProjectFolderErrorMessage,
  parseLocalFolderSourceUrl,
  validateLocalProjectFolder,
} from './localFolderSource.ts'
import { validateSourceUrl } from './validateSourceUrl.ts'

export type ProjectInstallSource =
  | { kind: 'git'; sourceUrl: string }
  | { kind: 'localFolder'; localFolderPath: string; sourceUrl: string }

export async function parseProjectInstallSource(input: {
  sourceUrl?: unknown
  localFolderPath?: unknown
}): Promise<{ ok: true; source: ProjectInstallSource } | { ok: false; message: string }> {
  const explicitLocal =
    typeof input.localFolderPath === 'string' && input.localFolderPath.trim().length > 0
      ? input.localFolderPath.trim()
      : ''

  const fromUrl =
    typeof input.sourceUrl === 'string' && isLocalFolderSourceUrl(input.sourceUrl)
      ? parseLocalFolderSourceUrl(input.sourceUrl)
      : null

  const localPath = explicitLocal || fromUrl || ''
  if (localPath) {
    const validated = await validateLocalProjectFolder(localPath)
    if (!validated.ok) {
      return { ok: false, message: localProjectFolderErrorMessage(validated.code) }
    }
    return {
      ok: true,
      source: {
        kind: 'localFolder',
        localFolderPath: validated.absolutePath,
        sourceUrl: encodeLocalFolderSourceUrl(validated.absolutePath),
      },
    }
  }

  if (typeof input.sourceUrl !== 'string') {
    return { ok: false, message: 'Parâmetros de instalação inválidos.' }
  }

  try {
    validateSourceUrl(input.sourceUrl)
  } catch {
    return { ok: false, message: 'Parâmetros de instalação inválidos.' }
  }

  return { ok: true, source: { kind: 'git', sourceUrl: input.sourceUrl } }
}
