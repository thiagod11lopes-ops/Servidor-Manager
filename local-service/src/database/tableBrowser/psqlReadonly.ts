import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PsqlConnection } from './psqlConnection.ts'

const execFileAsync = promisify(execFile)

const QUERY_TIMEOUT_MS = 30_000
const CONNECT_PROBE_TIMEOUT_MS = 12_000
const MAX_BUFFER = 8 * 1024 * 1024

export async function verifyPostgresConnection(
  connection: PsqlConnection,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const result = await runPsqlQueryInternal(connection, 'SELECT 1;', CONNECT_PROBE_TIMEOUT_MS)
  if (result.ok) {
    return result.stdout.trim() === '1' ? { ok: true } : { ok: false, detail: 'Resposta inesperada do PostgreSQL.' }
  }
  return { ok: false, detail: result.detail }
}

/** @deprecated Prefer verifyPostgresConnection with docker fallback from resolveSystemDatabaseUrl. */
export async function verifyPostgresDbUrl(
  dbUrl: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  return verifyPostgresConnection({ mode: 'url', dbUrl })
}

async function runPsqlQueryInternal(
  connection: PsqlConnection,
  sql: string,
  timeoutMs: number,
): Promise<{ ok: true; stdout: string } | { ok: false; code: string; detail: string }> {
  try {
    const { stdout } =
      connection.mode === 'url'
        ? await execFileAsync(
            'psql',
            [connection.dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-c', sql],
            { windowsHide: true, timeout: timeoutMs, maxBuffer: MAX_BUFFER },
          )
        : await execFileAsync(
            'docker',
            [
              'exec',
              '-i',
              connection.container,
              'psql',
              '-U',
              connection.user,
              '-d',
              connection.database,
              '-v',
              'ON_ERROR_STOP=1',
              '-q',
              '-t',
              '-A',
              '-c',
              sql,
            ],
            { windowsHide: true, timeout: timeoutMs, maxBuffer: MAX_BUFFER },
          )
    return { ok: true, stdout: stdout ?? '' }
  } catch (error) {
    return classifyPsqlExecError(error)
  }
}

function classifyPsqlExecError(
  error: unknown,
): { ok: false; code: string; detail: string } {
  const err = error as { stderr?: string; message?: string; cmd?: string }
  const raw = `${err.stderr ?? ''} ${err.message ?? ''}`.trim()
  const detail = raw.slice(0, 800)
  const lower = detail.toLowerCase()
  if (lower.includes('permission denied') || lower.includes('must be owner')) {
    return { ok: false, code: 'PERMISSION_DENIED', detail }
  }
  if (
    lower.includes('is not running') ||
    lower.includes('no such container') ||
    lower.includes('error response from daemon')
  ) {
    return { ok: false, code: 'CONNECTION_FAILED', detail }
  }
  if (
    lower.includes('could not connect') ||
    lower.includes('connection refused') ||
    lower.includes('fechou a conex') ||
    lower.includes('closed the connection unexpectedly') ||
    lower.includes('server closed') ||
    lower.includes('connection failed') ||
    lower.includes('timed out') ||
    lower.includes('etimedout')
  ) {
    return { ok: false, code: 'CONNECTION_FAILED', detail }
  }
  return { ok: false, code: 'QUERY_FAILED', detail: detail || 'Falha ao executar consulta.' }
}

export async function runPsqlQuery(
  connection: PsqlConnection,
  sql: string,
): Promise<{ ok: true; stdout: string } | { ok: false; code: string; detail: string }> {
  return runPsqlQueryInternal(connection, sql, QUERY_TIMEOUT_MS)
}
