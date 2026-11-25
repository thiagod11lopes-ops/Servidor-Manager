import path from 'node:path'
import { runControlledCommand } from '../installation/runControlledCommand.ts'
import { readSupabaseProjectIdFromRoot, supabaseDbContainerName } from '../database/tableBrowser/supabaseLocalDbContainer.ts'

/** Compara workdirs do CLI Supabase (Windows, case-insensitive). */
export function supabaseWorkdirsEqual(left: string, right: string): boolean {
  const norm = (value: string) =>
    value.replaceAll('\\', '/').replace(/\/+$/, '').trim().toLowerCase()
  return norm(left) === norm(right)
}

export type SupabaseStackDockerMetadata = {
  workdir: string
  cliProject: string | null
}

export async function readSupabaseStackDockerMetadata(
  rootDirectory: string,
  projectId?: string | null,
): Promise<SupabaseStackDockerMetadata | null> {
  const id = projectId ?? readSupabaseProjectIdFromRoot(rootDirectory)
  if (!id) return null

  const container = supabaseDbContainerName(id)
  const result = await runControlledCommand(
    {
      executable: 'docker',
      args: [
        'inspect',
        container,
        '--format',
        '{{index .Config.Labels "com.supabase.cli.workdir"}}|{{index .Config.Labels "com.supabase.cli.project"}}',
      ],
      label: 'docker inspect supabase stack',
    },
    rootDirectory,
  )

  if (!result.ok) return null
  const raw = result.output.trim()
  if (!raw || raw.startsWith('|') && raw.endsWith('|')) return null
  const [workdir = '', cliProject = ''] = raw.split('|')
  if (!workdir.trim()) return null
  return {
    workdir: workdir.trim(),
    cliProject: cliProject.trim() || null,
  }
}

export async function readSupabaseStackWorkdir(rootDirectory: string): Promise<string | null> {
  const meta = await readSupabaseStackDockerMetadata(rootDirectory)
  return meta?.workdir ?? null
}

export type SupabaseWorkdirMismatch = {
  registeredWorkdir: string
  expectedWorkdir: string
}

export async function detectSupabaseWorkdirMismatch(
  rootDirectory: string,
): Promise<SupabaseWorkdirMismatch | null> {
  const registered = await readSupabaseStackWorkdir(rootDirectory)
  if (!registered) return null
  const expected = path.resolve(rootDirectory)
  if (supabaseWorkdirsEqual(registered, expected)) return null
  return { registeredWorkdir: registered, expectedWorkdir: expected }
}
