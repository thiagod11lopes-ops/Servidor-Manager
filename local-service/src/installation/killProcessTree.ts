import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Encerra processo e filhos (npm/node sob PowerShell no Windows). */
export async function killProcessTree(pid: number | undefined): Promise<void> {
  if (!pid || pid <= 0) return
  try {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        timeout: 15_000,
      })
      return
    }
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // já encerrado
    }
  }
}
