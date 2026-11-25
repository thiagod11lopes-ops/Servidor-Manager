import fs from 'node:fs'
import path from 'node:path'
import { getProjectDirectory } from '../../installation/paths.ts'

/** Nome do container Postgres do Supabase CLI (`supabase_db_<project_id>`). */
export function supabaseDbContainerName(projectId: string): string {
  const safe = projectId.trim()
  return `supabase_db_${safe}`
}

export function parseDatabaseNameFromDbUrl(dbUrl: string): string {
  try {
    const url = new URL(dbUrl)
    const name = url.pathname.replace(/^\//, '').trim()
    return name || 'postgres'
  } catch {
    return 'postgres'
  }
}

export function readSupabaseProjectIdFromRoot(rootDirectory: string): string | null {
  const configPath = path.join(rootDirectory, 'supabase', 'config.toml')
  try {
    if (!fs.existsSync(configPath)) return null
    const raw = fs.readFileSync(configPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const match = raw.match(/^\s*project_id\s*=\s*"([^"]+)"/m)
    return match?.[1]?.trim() || null
  } catch {
    return null
  }
}

export function readSupabaseProjectId(systemId: string): string | null {
  return readSupabaseProjectIdFromRoot(getProjectDirectory(systemId))
}

export function resolveSupabaseDbDockerContainer(systemId: string): string | null {
  const projectId = readSupabaseProjectId(systemId)
  if (!projectId) return null
  return supabaseDbContainerName(projectId)
}
