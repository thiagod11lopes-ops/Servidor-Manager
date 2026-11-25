import fs from 'node:fs/promises'
import path from 'node:path'
import { normalizeLocalFolderPath } from './localFolderSource.ts'

const SKIP_TOP_LEVEL = new Set(['node_modules', '.git'])

export async function copyLocalFolderToDirectory(
  localFolderPath: string,
  projectDir: string,
  options?: { updateInPlace?: boolean },
): Promise<string> {
  const sourceAbs = path.resolve(localFolderPath.trim())
  const destAbs = path.resolve(projectDir)

  if (normalizeLocalFolderPath(sourceAbs) === normalizeLocalFolderPath(destAbs)) {
    throw new Error('LOCAL_COPY_SAME_PATH')
  }

  if (!options?.updateInPlace) {
    await fs.mkdir(path.dirname(destAbs), { recursive: true })
    await fs.rm(destAbs, { recursive: true, force: true })
  } else {
    await fs.mkdir(destAbs, { recursive: true })
  }

  try {
    await fs.cp(sourceAbs, destAbs, {
      recursive: true,
      force: true,
      filter: (src) => {
        const relative = path.relative(sourceAbs, src)
        if (!relative || relative === '.') return true
        const top = relative.split(path.sep)[0]
        if (top && SKIP_TOP_LEVEL.has(top)) return false
        return true
      },
    })
  } catch {
    throw new Error('LOCAL_COPY_FAILED')
  }

  return sourceAbs
}
