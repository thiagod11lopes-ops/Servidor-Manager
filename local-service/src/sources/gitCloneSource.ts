import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { gitCloneRefArgs, normalizeGitRemoteUrl, validateSourceUrl } from './validateSourceUrl.ts'

const execFileAsync = promisify(execFile)
const CLONE_TIMEOUT_MS = 120_000

export type GitCheckout = {
  workDir: string
  projectDir: string
  remoteUrl: string
}

async function assertGitAvailable(): Promise<void> {
  try {
    await execFileAsync('git', ['--version'], { windowsHide: true, timeout: 10_000 })
  } catch {
    throw new Error('GIT_NOT_AVAILABLE')
  }
}

export async function checkoutGitSource(sourceUrl: string): Promise<GitCheckout> {
  const validated = validateSourceUrl(sourceUrl)
  const remoteUrl = normalizeGitRemoteUrl(validated)
  await assertGitAvailable()

  const workDir = path.join(os.tmpdir(), 'servidor-manager', `analysis-${randomUUID()}`)
  const projectDir = path.join(workDir, 'project')

  await fs.mkdir(workDir, { recursive: true })

  try {
    await execFileAsync(
      'git',
      ['clone', '--depth', '1', '--single-branch', ...gitCloneRefArgs(sourceUrl), remoteUrl, projectDir],
      { windowsHide: true, timeout: CLONE_TIMEOUT_MS },
    )
  } catch {
    await fs.rm(workDir, { recursive: true, force: true })
    throw new Error('GIT_CLONE_FAILED')
  }

  return { workDir, projectDir, remoteUrl }
}

export async function removeCheckout(workDir: string): Promise<void> {
  await fs.rm(workDir, { recursive: true, force: true })
}
