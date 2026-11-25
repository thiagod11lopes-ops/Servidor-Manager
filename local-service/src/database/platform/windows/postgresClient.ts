import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PostgresAdminCredentials } from '../../provisioning/types.ts'
import type { PostgresClient } from '../postgresClient.ts'

const execFileAsync = promisify(execFile)

function sanitizeSqlForLog(sql: string): string {
  return sql.replace(/password\s+'[^']*'/gi, "password '[redacted]'")
}

export const windowsPostgresClient: PostgresClient = {
  async runAdminQuery(credentials, sql) {
    const env = {
      ...process.env,
      PGPASSWORD: credentials.password,
      PGCLIENTENCODING: 'UTF8',
    }

    try {
      const { stdout } = await execFileAsync(
        'psql',
        [
          '-h',
          credentials.host,
          '-p',
          String(credentials.port),
          '-U',
          credentials.user,
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
          '-q',
          '-t',
          '-c',
          sql,
        ],
        {
          env,
          windowsHide: true,
          timeout: 30_000,
          maxBuffer: 512 * 1024,
        },
      )
      return { ok: true, stdout: stdout ?? '' }
    } catch (error) {
      const err = error as { stderr?: string; message?: string }
      const detail = `${err.stderr ?? ''} ${err.message ?? ''}`.trim()
      if (detail.toLowerCase().includes('password authentication failed')) {
        return { ok: false, code: 'ADMIN_AUTH_FAILED' }
      }
      if (detail.toLowerCase().includes('could not connect')) {
        return { ok: false, code: 'CONNECTION_FAILED' }
      }
      void sanitizeSqlForLog(sql)
      return { ok: false, code: 'SQL_FAILED' }
    }
  },
}
