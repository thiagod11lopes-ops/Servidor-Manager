import { isLocalFolderSourceUrl } from './localFolderSource.ts'
import { extractGitRef, validateSourceUrl } from './validateSourceUrl.ts'

export type ResolvedInstallGitRef =
  | { ok: true; gitRef: string | null; sourceKind: 'localFolder' | 'git' }
  | { ok: false; message: string }

/**
 * Ref Git só se aplica a origem remota. Pasta local usa `local-folder:` e não passa por validateSourceUrl.
 */
export function resolveInstallGitRef(sourceUrl: string): ResolvedInstallGitRef {
  if (isLocalFolderSourceUrl(sourceUrl)) {
    return { ok: true, gitRef: null, sourceKind: 'localFolder' }
  }

  try {
    const url = validateSourceUrl(sourceUrl)
    return { ok: true, gitRef: extractGitRef(url), sourceKind: 'git' }
  } catch {
    return { ok: false, message: 'URL de origem inválida.' }
  }
}
