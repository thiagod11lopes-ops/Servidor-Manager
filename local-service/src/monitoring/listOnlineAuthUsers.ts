import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { OnlineUserEntry } from './types.ts'

const execFileAsync = promisify(execFile)

export const ONLINE_IDLE_MINUTES = 15

type RawOnlineRow = {
  userId?: string
  email?: string | null
  displayName?: string | null
  lastActivityAt?: string | null
}

async function runPsqlJson(dbUrl: string, sql: string): Promise<RawOnlineRow[] | null> {
  try {
    const { stdout } = await execFileAsync(
      'psql',
      [dbUrl, '-t', '-A', '-c', sql],
      { windowsHide: true, timeout: 15_000, maxBuffer: 512 * 1024 },
    )
    const trimmed = String(stdout).trim()
    if (!trimmed || trimmed === 'null') return []
    const parsed = JSON.parse(trimmed) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((row): row is RawOnlineRow => Boolean(row && typeof row === 'object'))
  } catch {
    return null
  }
}

function mapRows(rows: RawOnlineRow[]): Omit<OnlineUserEntry, 'systemId' | 'systemLabel'>[] {
  return rows
    .map((row) => ({
      userId: String(row.userId ?? ''),
      email: typeof row.email === 'string' ? row.email : null,
      displayName:
        typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName.trim() : null,
      lastActivityAt: typeof row.lastActivityAt === 'string' ? row.lastActivityAt : null,
    }))
    .filter((row) => row.userId.length > 0)
}

/** Utilizadores com sessão Auth recente (ou login recente como fallback). */
export async function listOnlineAuthUsers(
  dbUrl: string,
  idleMinutes = ONLINE_IDLE_MINUTES,
): Promise<{ users: Omit<OnlineUserEntry, 'systemId' | 'systemLabel'>[]; detail: string | null }> {
  const minutes = Math.max(1, Math.min(120, Math.floor(idleMinutes)))

  const sessionsSql = `
SELECT COALESCE(
  (SELECT json_agg(row_to_json(x)) FROM (
    SELECT DISTINCT ON (u.id)
      u.id::text AS "userId",
      u.email AS email,
      NULLIF(TRIM(COALESCE(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        u.raw_user_meta_data->>'display_name'
      )), '') AS "displayName",
      to_char(GREATEST(s.updated_at, s.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastActivityAt"
    FROM auth.sessions s
    INNER JOIN auth.users u ON u.id = s.user_id
    WHERE GREATEST(s.updated_at, s.created_at) >= NOW() - INTERVAL '${minutes} minutes'
      AND (s.not_after IS NULL OR s.not_after > NOW())
    ORDER BY u.id, GREATEST(s.updated_at, s.created_at) DESC
  ) x),
  '[]'::json
)::text;
`.trim()

  const sessionRows = await runPsqlJson(dbUrl, sessionsSql)
  if (sessionRows != null) {
    const users = mapRows(sessionRows)
    return {
      users,
      detail:
        users.length > 0
          ? `Sessões Auth ativas nos últimos ${minutes} min`
          : `Nenhuma sessão Auth nos últimos ${minutes} min`,
    }
  }

  const usersSql = `
SELECT COALESCE(
  (SELECT json_agg(row_to_json(x)) FROM (
    SELECT
      u.id::text AS "userId",
      u.email AS email,
      NULLIF(TRIM(COALESCE(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        u.raw_user_meta_data->>'display_name'
      )), '') AS "displayName",
      to_char(u.last_sign_in_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastActivityAt"
    FROM auth.users u
    WHERE u.last_sign_in_at >= NOW() - INTERVAL '${minutes} minutes'
    ORDER BY u.last_sign_in_at DESC
  ) x),
  '[]'::json
)::text;
`.trim()

  const fallbackRows = await runPsqlJson(dbUrl, usersSql)
  if (fallbackRows != null) {
    const users = mapRows(fallbackRows)
    return {
      users,
      detail:
        users.length > 0
          ? `Login recente (últimos ${minutes} min) — estimativa sem tabela de sessões`
          : `Nenhum login recente nos últimos ${minutes} min`,
    }
  }

  return { users: [], detail: 'Não foi possível consultar auth.sessions nem auth.users (psql/Postgres).' }
}
