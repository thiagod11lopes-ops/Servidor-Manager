import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolveBootstrapScriptDir } from './resolveBootstrapScriptDir.ts'

export type BootstrapJobPhase = 'queued' | 'running' | 'success' | 'error' | 'cancelled'

export type BootstrapJobOutcome =
  | 'success'
  | 'verification_failed'
  | 'manual_required'
  | 'install_failed'
  | 'winget_missing'

export type BootstrapJobRecord = {
  jobId: string
  phase: BootstrapJobPhase
  outcome?: BootstrapJobOutcome
  startedAt: string
  finishedAt?: string
  logPath: string
  exitCode?: number | null
  message?: string
}

function describeBootstrapExit(code: number | null | undefined): {
  outcome: BootstrapJobOutcome
  message: string
  phase: BootstrapJobPhase
} {
  switch (code) {
    case 0:
      return {
        outcome: 'success',
        phase: 'success',
        message:
          'Preparação concluída. Clique em “Verificar de novo”. Reinicie o atalho se acabou de instalar ferramentas.',
      }
    case 2:
      return {
        outcome: 'winget_missing',
        phase: 'error',
        message: 'winget não encontrado. Instale o App Installer (Microsoft Store) e tente novamente.',
      }
    case 3:
      return {
        outcome: 'manual_required',
        phase: 'error',
        message:
          'Ferramentas instaladas, mas o Docker Engine não está em execução. Abra o Docker Desktop, aguarde e verifique de novo.',
      }
    case 4:
      return {
        outcome: 'install_failed',
        phase: 'error',
        message: 'Falha ao instalar um ou mais componentes (winget/npm). Veja o log abaixo.',
      }
    case 1:
    default:
      return {
        outcome: 'verification_failed',
        phase: 'error',
        message:
          'Ainda faltam dependências críticas ou não estão funcionais. Veja o log, corrija manualmente se necessário e verifique de novo.',
      }
  }
}

const jobs = new Map<string, BootstrapJobRecord>()

async function ensureLogsDir(): Promise<string> {
  const { getManagerLogsDir } = await import('../installation/managerDataRoot.ts')
  const dir = getManagerLogsDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export function getBootstrapJob(jobId: string): BootstrapJobRecord | undefined {
  return jobs.get(jobId)
}

export async function startBootstrapInstallJob(options: {
  installMissing: boolean
  launchDockerDesktop: boolean
}): Promise<{ ok: true; job: BootstrapJobRecord } | { ok: false; message: string }> {
  const scriptDir = resolveBootstrapScriptDir()
  if (!scriptDir) {
    return {
      ok: false,
      message:
        'Script Invoke-ServerBootstrap.ps1 não encontrado. Reinstale o Manager ou execute npm run update:installed.',
    }
  }

  const scriptPath = path.join(scriptDir, 'Invoke-ServerBootstrap.ps1')
  const logsDir = await ensureLogsDir()
  const jobId = randomUUID()
  const logPath = path.join(logsDir, `bootstrap-${jobId}.log`)

  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-LogPath',
    logPath,
  ]
  if (options.installMissing) args.push('-InstallMissing')
  if (options.launchDockerDesktop) args.push('-LaunchDockerDesktop')

  const job: BootstrapJobRecord = {
    jobId,
    phase: 'running',
    startedAt: new Date().toISOString(),
    logPath,
  }
  jobs.set(jobId, job)

  const child = spawn('powershell.exe', args, {
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, SM_BOOTSTRAP_JOB: jobId },
  })

  child.on('exit', (code) => {
    const current = jobs.get(jobId)
    if (!current) return
    current.finishedAt = new Date().toISOString()
    current.exitCode = code
    const described = describeBootstrapExit(code)
    current.phase = described.phase
    current.outcome = described.outcome
    current.message = described.message
    jobs.set(jobId, current)
  })

  child.on('error', (error) => {
    const current = jobs.get(jobId)
    if (!current) return
    current.phase = 'error'
    current.finishedAt = new Date().toISOString()
    current.message = error.message
    jobs.set(jobId, current)
  })

  return { ok: true, job }
}

export async function readBootstrapJobLogTail(logPath: string, maxBytes = 48_000): Promise<string> {
  try {
    const stat = await fs.stat(logPath)
    const start = Math.max(0, stat.size - maxBytes)
    const handle = await fs.open(logPath, 'r')
    try {
      const buffer = Buffer.alloc(stat.size - start)
      await handle.read(buffer, 0, buffer.length, start)
      return buffer.toString('utf8')
    } finally {
      await handle.close()
    }
  } catch {
    return ''
  }
}
