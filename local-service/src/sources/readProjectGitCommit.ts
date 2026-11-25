import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** SHA do HEAD no clone (reprodutibilidade da instalação). */
export async function readProjectGitCommit(projectDirectory: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectDirectory, 'rev-parse', 'HEAD'], {
      windowsHide: true,
      timeout: 20_000,
    })
    const sha = String(stdout).trim()
    return /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null
  } catch {
    return null
  }
}
