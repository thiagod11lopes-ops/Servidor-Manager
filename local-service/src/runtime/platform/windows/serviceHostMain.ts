import fs from 'node:fs/promises'
import { buildApplicationEnv } from '../../env/buildApplicationEnv.ts'
import { resolveValidatedRuntimeStart } from '../../service/runtimeStartPlan.ts'
import { appendServiceLog, prepareRuntimeLogs } from '../../logWriter.ts'
import { getApplicationPidPath } from '../../runtimePaths.ts'
import { spawnManagedProcess } from '../spawnManagedProcess.ts'
import { getProcessPlatform } from '../index.ts'

async function writeApplicationPid(systemId: string, pid: number | null): Promise<void> {
  const filePath = getApplicationPidPath(systemId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  if (pid == null) {
    await fs.rm(filePath, { force: true })
    return
  }
  await fs.writeFile(filePath, String(pid), 'utf8')
}

export async function runServiceHost(systemId: string): Promise<number> {
  await appendServiceLog(systemId, `Host iniciado (${new Date().toISOString()})`)

  const validated = await resolveValidatedRuntimeStart(systemId)
  if (!validated.ok) {
    await appendServiceLog(systemId, `Falha: ${validated.message}`)
    return 1
  }

  const extraEnv = await buildApplicationEnv(systemId)
  const { stdoutPath, stderrPath } = await prepareRuntimeLogs(systemId)
  const child = spawnManagedProcess(
    validated.plan.startCommand,
    validated.plan.projectDirectory,
    stdoutPath,
    stderrPath,
    { detached: false, env: extraEnv },
  )

  const pid = child.pid
  if (!pid) {
    await appendServiceLog(systemId, 'Falha ao obter PID da aplicação.')
    return 1
  }

  await writeApplicationPid(systemId, pid)
  await appendServiceLog(systemId, `Aplicação iniciada (PID ${pid}).`)

  const platform = getProcessPlatform()
  let stopping = false

  const shutdown = async (reason: string) => {
    if (stopping) return
    stopping = true
    await appendServiceLog(systemId, `Encerrando: ${reason}`)
    try {
      await platform.terminateProcessTree(pid)
    } catch {
      // ignore
    }
    await writeApplicationPid(systemId, null)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGHUP', () => void shutdown('SIGHUP'))

  return await new Promise<number>((resolve) => {
    child.on('exit', (code, signal) => {
      void appendServiceLog(
        systemId,
        `Aplicação encerrada (código ${code ?? 'n/a'}, sinal ${signal ?? 'n/a'}).`,
      ).finally(() => {
        void writeApplicationPid(systemId, null).finally(() => resolve(code ?? 0))
      })
    })
  })
}
