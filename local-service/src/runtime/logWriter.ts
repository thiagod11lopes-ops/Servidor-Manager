import fs from 'node:fs/promises'
import { getLogsDirectory, getServiceLogPath, getStderrLogPath, getStdoutLogPath } from './runtimePaths.ts'

const MAX_LOG_BYTES = 2 * 1024 * 1024

export async function prepareRuntimeLogs(systemId: string): Promise<{
  stdoutPath: string
  stderrPath: string
}> {
  const stdoutPath = getStdoutLogPath(systemId)
  const stderrPath = getStderrLogPath(systemId)
  await fs.mkdir(getLogsDirectory(systemId), { recursive: true })

  for (const filePath of [stdoutPath, stderrPath]) {
    try {
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_LOG_BYTES) {
        const archived = `${filePath}.1`
        await fs.rm(archived, { force: true })
        await fs.rename(filePath, archived)
      }
    } catch {
      // file may not exist yet
    }
    await fs.appendFile(filePath, `\n--- ${new Date().toISOString()} ---\n`, 'utf8')
  }

  return { stdoutPath, stderrPath }
}

export async function appendServiceLog(systemId: string, line: string): Promise<void> {
  const safeLine = line.replace(/password\s*=\s*\S+/gi, 'password=[redacted]')
  const filePath = getServiceLogPath(systemId)
  await fs.mkdir(getLogsDirectory(systemId), { recursive: true })
  await fs.appendFile(filePath, `[${new Date().toISOString()}] ${safeLine}\n`, 'utf8')
}
