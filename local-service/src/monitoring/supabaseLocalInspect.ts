import { runSupabase } from '../serverManifest/supabaseLocalCommands.ts'
import { getProjectDirectory } from '../installation/paths.ts'

export type SupabaseStatusJson = {
  API_URL?: string
  DB_URL?: string
  SERVICE_ROLE_KEY?: string
  ANON_KEY?: string
}

/** CLI Supabase às vezes imprime avisos antes do JSON (`Stopped services: …`). */
export function parseSupabaseStatusOutput(output: string): SupabaseStatusJson | null {
  const trimmed = output.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as SupabaseStatusJson
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as SupabaseStatusJson
    } catch {
      return null
    }
  }
}

/** Supabase CLI lista serviços opcionais parados mesmo com o Postgres no ar. */
export function supabaseStatusIndicatesDbStopped(raw: string): boolean {
  const stoppedMatch = raw.match(/Stopped services:\s*\[([^\]]*)\]/i)
  if (stoppedMatch) {
    const list = stoppedMatch[1].toLowerCase()
    if (/supabase_db|_db_/.test(list)) return true
    return false
  }
  return /not running|no such container|failed to inspect supabase_db|supabase_db.*is not running/i.test(raw)
}

export async function readSupabaseStatusJson(systemId: string): Promise<{
  ok: boolean
  rootDirectory: string
  status: SupabaseStatusJson | null
  detail: string | null
}> {
  const rootDirectory = getProjectDirectory(systemId)
  const result = await runSupabase(['status', '-o', 'json'], rootDirectory)
  const raw = result.output
  const status = parseSupabaseStatusOutput(raw)
  const dbStopped = supabaseStatusIndicatesDbStopped(raw)

  if (status?.DB_URL && !dbStopped) {
    return { ok: true, rootDirectory, status, detail: null }
  }

  if (status?.DB_URL && dbStopped) {
    return {
      ok: false,
      rootDirectory,
      status,
      detail:
        'Supabase local parado (porta 54322). Inicie o sistema na aba Sistemas ou aguarde a subida automática.',
    }
  }

  if (!result.ok) {
    const snippet = result.output.trim().slice(0, 500)
    const stopped =
      /not running|no such container|failed to inspect|is not running/i.test(snippet) ||
      /docker/i.test(snippet)
    return {
      ok: false,
      rootDirectory,
      status: null,
      detail: stopped
        ? 'Supabase local parado ou Docker indisponível. Inicie o sistema (supabase start) e tente de novo.'
        : snippet || 'Não foi possível obter status do Supabase local.',
    }
  }

  return {
    ok: false,
    rootDirectory,
    status: null,
    detail:
      'Supabase CLI não retornou DB_URL. Confirme que o stack local está em execução na pasta do projeto.',
  }
}

export async function queryPostgresDatabaseBytes(
  dbUrl: string,
  databaseName = 'postgres',
): Promise<{ bytes: number | null; detail: string | null }> {
  const sql = `SELECT pg_database_size('${databaseName.replace(/'/g, "''")}') AS size;`
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  try {
    const { stdout } = await execFileAsync(
      'psql',
      [dbUrl, '-t', '-A', '-c', sql],
      { windowsHide: true, timeout: 15_000, maxBuffer: 256 * 1024 },
    )
    const value = Number.parseInt(stdout.trim(), 10)
    if (!Number.isFinite(value)) {
      return { bytes: null, detail: 'Não foi possível interpretar pg_database_size.' }
    }
    return { bytes: value, detail: 'pg_database_size (PostgreSQL local Supabase)' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { bytes: null, detail: message }
  }
}
