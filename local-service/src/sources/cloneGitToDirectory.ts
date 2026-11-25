import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gitCloneRefArgs, normalizeGitRemoteUrl, validateSourceUrl } from './validateSourceUrl.ts'

const execFileAsync = promisify(execFile)
const CLONE_TIMEOUT_MS = 180_000

export async function cloneGitToDirectory(
  sourceUrl: string,
  projectDir: string,
  options?: { updateInPlace?: boolean },
): Promise<string> {
  const validated = validateSourceUrl(sourceUrl)
  const remoteUrl = normalizeGitRemoteUrl(validated)
  const ref = gitCloneRefArgs(sourceUrl)[1]

  if (options?.updateInPlace) {
    await fs.access(path.join(projectDir, '.git'))
    if (!ref) throw new Error('GIT_UPDATE_FAILED')
    try {
      await execFileAsync('git', ['fetch', '--depth', '1', 'origin', ref], {
        cwd: projectDir,
        windowsHide: true,
        timeout: CLONE_TIMEOUT_MS,
      })
      await execFileAsync('git', ['checkout', '-f', ref], {
        cwd: projectDir,
        windowsHide: true,
        timeout: CLONE_TIMEOUT_MS,
      })
      await execFileAsync('git', ['reset', '--hard', 'FETCH_HEAD'], {
        cwd: projectDir,
        windowsHide: true,
        timeout: CLONE_TIMEOUT_MS,
      })
      return remoteUrl
    } catch {
      throw new Error('GIT_UPDATE_FAILED')
    }
  }

  await fs.mkdir(path.dirname(projectDir), { recursive: true })
  await fs.rm(projectDir, { recursive: true, force: true })

  try {
    await execFileAsync(
      'git',
      ['clone', '--depth', '1', '--single-branch', ...gitCloneRefArgs(sourceUrl), remoteUrl, projectDir],
      { windowsHide: true, timeout: CLONE_TIMEOUT_MS },
    )
  } catch {
    throw new Error('GIT_CLONE_FAILED')
  }

  return remoteUrl
}
