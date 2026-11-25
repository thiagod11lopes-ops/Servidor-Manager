import { getProjectDirectory } from '../../installation/paths.ts'
import { readInstallationManifest } from '../../runtime/installationManifest.ts'
import { startManagedSystem } from '../../runtime/systemProcessManager.ts'
import { supabaseEnsureStarted } from '../../serverManifest/supabaseLocalCommands.ts'
import { SUPPORTED_BACKEND_PROFILE } from '../../serverManifest/types.ts'
import { readSupabaseStatusJson } from '../../monitoring/supabaseLocalInspect.ts'
import type { PsqlConnection } from './psqlConnection.ts'
import { psqlConnectionFromDbUrl, psqlConnectionWithDockerFallback } from './psqlConnection.ts'
import { verifyPostgresConnection } from './psqlReadonly.ts'
import { resolveSupabaseDbDockerContainer } from './supabaseLocalDbContainer.ts'

export type SystemDatabaseResolution =
  | { ok: true; dbUrl: string; psql: PsqlConnection; detail: string }
  | { ok: false; code: 'NOT_FOUND' | 'UNSUPPORTED_PROFILE' | 'SUPABASE_STOPPED' | 'PSQL_UNAVAILABLE'; message: string }

export type ResolveSystemDatabaseOptions = {
  /** Tenta subir stack (Iniciar) + Supabase se o Postgres não responder. */
  allowSupabaseStart?: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function probePostgresAccess(systemId: string, dbUrl: string): Promise<PsqlConnection | null> {
  const hostConn = psqlConnectionFromDbUrl(dbUrl)
  const hostProbe = await verifyPostgresConnection(hostConn)
  if (hostProbe.ok) return hostConn

  const container = resolveSupabaseDbDockerContainer(systemId)
  if (!container) return null

  const dockerConn = psqlConnectionWithDockerFallback(dbUrl, container)
  if (dockerConn.mode !== 'docker') return null

  const dockerProbe = await verifyPostgresConnection(dockerConn)
  return dockerProbe.ok ? dockerConn : null
}

export async function resolveSystemDatabaseUrl(
  systemId: string,
  options: ResolveSystemDatabaseOptions = {},
): Promise<SystemDatabaseResolution> {
  const allowSupabaseStart = options.allowSupabaseStart === true
  const manifest = await readInstallationManifest(systemId)
  if (!manifest) {
    return { ok: false, code: 'NOT_FOUND', message: 'Sistema não encontrado ou instalação incompleta.' }
  }

  if (manifest.serverManifestProfile !== SUPPORTED_BACKEND_PROFILE) {
    return {
      ok: false,
      code: 'UNSUPPORTED_PROFILE',
      message: 'Visualização de tabelas disponível apenas para sistemas Supabase local (supabase-local-v1).',
    }
  }

  async function resolveLiveConnection(): Promise<{ dbUrl: string; psql: PsqlConnection } | null> {
    const supa = await readSupabaseStatusJson(systemId)
    const dbUrl = supa.status?.DB_URL?.trim()
    if (!dbUrl) return null
    const psql = await probePostgresAccess(systemId, dbUrl)
    if (!psql) return null
    return { dbUrl, psql }
  }

  async function waitForPostgresReady(attempts: number, delayMs: number): Promise<{ dbUrl: string; psql: PsqlConnection } | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const live = await resolveLiveConnection()
      if (live) return live
      if (attempt < attempts - 1) await sleep(delayMs)
    }
    return null
  }

  const live = await resolveLiveConnection()
  if (live) {
    return {
      ok: true,
      dbUrl: live.dbUrl,
      psql: live.psql,
      detail:
        live.psql.mode === 'docker'
          ? 'PostgreSQL local via container Docker (porta publicada indisponível no host).'
          : 'PostgreSQL local via Supabase CLI (DB_URL).',
    }
  }

  let startHint: string | null = null

  if (allowSupabaseStart) {
    const startResult = await startManagedSystem(systemId)
    if (!startResult.ok && startResult.message) {
      startHint = startResult.message
      const benign =
        /já está em execução|inicialização já em andamento|stack lan já/i.test(startResult.message)
      if (!benign) {
        // Continua tentando Supabase/postgres — Caddy pode estar up sem Postgres.
      }
    }

    const afterStart = await waitForPostgresReady(24, 5_000)
    if (afterStart) {
      return {
        ok: true,
        dbUrl: afterStart.dbUrl,
        psql: afterStart.psql,
        detail: 'PostgreSQL local acessível após iniciar o stack do sistema.',
      }
    }

    const rootDirectory = getProjectDirectory(systemId)
    const supa = await supabaseEnsureStarted(rootDirectory, { systemId })
    if (!supa.ok && !startHint) {
      startHint = supa.output.trim().slice(0, 400)
    }

    const afterSupa = await waitForPostgresReady(18, 5_000)
    if (afterSupa) {
      return {
        ok: true,
        dbUrl: afterSupa.dbUrl,
        psql: afterSupa.psql,
        detail: 'PostgreSQL local iniciado via Supabase CLI.',
      }
    }
  }

  const supaAfter = await readSupabaseStatusJson(systemId)
  const dockerHint = /docker|daemon|container/i.test(`${supaAfter.detail ?? ''} ${startHint ?? ''}`)
    ? ' Verifique se o Docker Desktop está aberto e em execução.'
    : ''

  const detail =
    supaAfter.detail ??
    (startHint
      ? `${startHint.slice(0, 280)}${startHint.length > 280 ? '…' : ''}`
      : 'Supabase/PostgreSQL local indisponível (porta 54322).')

  return {
    ok: false,
    code: 'SUPABASE_STOPPED',
    message: `${detail}${dockerHint} Use Sistemas → Iniciar e aguarde o status Executando antes de abrir Banco de dados.`,
  }
}
