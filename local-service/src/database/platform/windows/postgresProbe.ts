import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PostgreSqlHostStatus } from '../../types/databaseTypes.ts'

const execFileAsync = promisify(execFile)

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync('where', [command], { windowsHide: true, timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

async function probeServerReachable(): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync(
      'pg_isready',
      ['-h', '127.0.0.1', '-p', '5432'],
      { windowsHide: true, timeout: 8_000 },
    )
    return /accepting connections/i.test(stdout)
  } catch (error) {
    const err = error as { stdout?: string; code?: number }
    if (typeof err.stdout === 'string' && /accepting connections/i.test(err.stdout)) {
      return true
    }
    if (err.code === 2 || err.code === 1) return false
    return null
  }
}

function buildSummary(status: Omit<PostgreSqlHostStatus, 'summary'>): string {
  if (!status.psqlAvailable && !status.pgIsreadyAvailable) {
    return 'PostgreSQL não encontrado. Nenhuma instalação foi realizada nesta etapa.'
  }
  if (status.serverReachable === true) {
    return 'PostgreSQL detectado. Servidor local disponível.'
  }
  if (status.serverReachable === false) {
    return 'Ferramentas PostgreSQL encontradas, mas o servidor local não está acessível em 127.0.0.1:5432.'
  }
  return 'Ferramentas PostgreSQL encontradas. Disponibilidade do servidor não pôde ser confirmada.'
}

export async function probePostgreSqlWindows(): Promise<PostgreSqlHostStatus> {
  const psqlAvailable = await commandExists('psql')
  const pgIsreadyAvailable = await commandExists('pg_isready')

  let serverReachable: boolean | null = null
  if (pgIsreadyAvailable) {
    serverReachable = await probeServerReachable()
  }

  const partial = { psqlAvailable, pgIsreadyAvailable, serverReachable }
  return { ...partial, summary: buildSummary(partial) }
}
