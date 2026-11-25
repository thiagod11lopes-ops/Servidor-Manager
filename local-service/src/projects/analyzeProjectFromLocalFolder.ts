import {
  encodeLocalFolderSourceUrl,
  localProjectFolderErrorMessage,
  validateLocalProjectFolder,
} from '../sources/localFolderSource.ts'
import { inspectProjectDirectory } from './inspectProjectDirectory.ts'

function errorMessage(code: string): string {
  if (code.startsWith('DOCKER_NOT_READY:')) {
    const parts = code.split(':')
    return parts.slice(2).join(':') || 'Docker indisponível.'
  }
  return localProjectFolderErrorMessage(code)
}

export async function analyzeProjectFromLocalFolder(localFolderPath: string) {
  const validated = await validateLocalProjectFolder(localFolderPath)
  if (!validated.ok) {
    return { ok: false as const, message: errorMessage(validated.code) }
  }

  const sourceUrl = encodeLocalFolderSourceUrl(validated.absolutePath)

  try {
    const { result } = await inspectProjectDirectory({
      projectDir: validated.absolutePath,
      sourceUrl,
      gitRef: null,
    })

    const withLocalMeta = {
      ...result,
      sourceKind: 'localFolder' as const,
      localFolderPath: validated.absolutePath,
      disclaimer:
        'Análise real dos arquivos da pasta local. Nenhum script do projeto foi executado.',
    }

    return { ok: true as const, result: withLocalMeta }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN'
    return { ok: false as const, message: errorMessage(code) }
  }
}
