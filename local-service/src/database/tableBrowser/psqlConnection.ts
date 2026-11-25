import { parseDatabaseNameFromDbUrl } from './supabaseLocalDbContainer.ts'

export type PsqlConnection =
  | { mode: 'url'; dbUrl: string }
  | { mode: 'docker'; container: string; database: string; user: string }

export function psqlConnectionFromDbUrl(dbUrl: string): PsqlConnection {
  return { mode: 'url', dbUrl }
}

export function psqlConnectionWithDockerFallback(
  dbUrl: string,
  dockerContainer: string | null | undefined,
): PsqlConnection {
  if (!dockerContainer?.trim()) {
    return psqlConnectionFromDbUrl(dbUrl)
  }
  return {
    mode: 'docker',
    container: dockerContainer.trim(),
    database: parseDatabaseNameFromDbUrl(dbUrl),
    user: 'postgres',
  }
}
