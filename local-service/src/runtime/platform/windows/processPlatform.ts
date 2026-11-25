import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProcessPlatform } from '../processPlatform.ts'

const execFileAsync = promisify(execFile)

async function isProcessAlive(pid: number): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) return false

  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { windowsHide: true, timeout: 10_000 },
      )
      return stdout.includes(`"${pid}"`)
    }

    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function terminateProcessTree(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) return

  if (process.platform !== 'win32') {
    process.kill(pid, 'SIGTERM')
    return
  }

  await execFileAsync('taskkill', ['/PID', String(pid), '/T'], {
    windowsHide: true,
    timeout: 20_000,
  })
}

export const windowsProcessPlatform: ProcessPlatform = {
  isProcessAlive,
  terminateProcessTree,
}
