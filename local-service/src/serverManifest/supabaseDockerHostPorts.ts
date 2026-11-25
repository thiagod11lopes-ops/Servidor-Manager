import { runControlledCommand } from '../installation/runControlledCommand.ts'

/** Extrai portas publicadas no host a partir de `docker inspect --format '{{json .NetworkSettings.Ports}}'`. */
export function parseDockerNetworkSettingsPortsJson(raw: string): number[] {
  const ports = new Set<number>()
  let parsed: Record<string, Array<{ HostPort?: string }> | null> | null = null
  try {
    parsed = JSON.parse(raw.trim()) as typeof parsed
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  for (const bindings of Object.values(parsed)) {
    if (!bindings) continue
    for (const entry of bindings) {
      const hostPort = entry?.HostPort
      if (!hostPort) continue
      const n = Number.parseInt(hostPort, 10)
      if (Number.isFinite(n) && n > 0) ports.add(n)
    }
  }
  return [...ports]
}

/**
 * Portas TCP no host já publicadas por stacks Supabase CLI (qualquer project_id).
 * Complementa leitura de config.toml/identidade — cobre stacks legadas sem registro Manager.
 */
export async function collectUsedSupabaseHostPortsFromDocker(): Promise<Set<number>> {
  const used = new Set<number>()
  const list = await runControlledCommand(
    {
      executable: 'docker',
      args: [
        'ps',
        '-a',
        '--filter',
        'label=com.supabase.cli.project',
        '--format',
        '{{.Names}}',
      ],
      label: 'docker ps supabase cli stacks',
    },
    process.cwd(),
  )
  if (!list.ok) return used

  const names = [
    ...new Set(
      list.output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ]

  for (const name of names) {
    const inspect = await runControlledCommand(
      {
        executable: 'docker',
        args: ['inspect', name, '--format', '{{json .NetworkSettings.Ports}}'],
        label: `docker inspect ports ${name}`,
      },
      process.cwd(),
    )
    if (!inspect.ok) continue
    for (const port of parseDockerNetworkSettingsPortsJson(inspect.output)) {
      used.add(port)
    }
  }

  return used
}
