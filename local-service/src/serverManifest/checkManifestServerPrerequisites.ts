import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildPhaseExecutionPlan, detectManifestPlatform } from './buildPhaseExecutionPlan.ts'
import type { ManifestPlatform, ServerManifest } from './types.ts'
import { isWindowsBashAvailable } from '../installation/resolveWindowsBash.ts'
import { isCommandAvailable, usesWindowsShellWrapper } from '../installation/windowsCommands.ts'

const execFileAsync = promisify(execFile)

export type ManifestPrerequisiteIssue = {
  tool: string
  reason: string
  step: string
}

export type ManifestPrerequisitesResult =
  | { ok: true; platform: ManifestPlatform; checked: string[] }
  | { ok: false; platform: ManifestPlatform | null; missing: ManifestPrerequisiteIssue[] }

async function readNodeMajorVersion(): Promise<number | null> {
  if (!(await isCommandAvailable('node'))) return null
  try {
    const { stdout } = await execFileAsync('node', ['--version'], { windowsHide: true, timeout: 15_000 })
    const m = /v?(\d+)/.exec(String(stdout).trim())
    return m ? Number(m[1]) : null
  } catch {
    return null
  }
}

async function toolRuns(command: string, args: string[] = ['--version']): Promise<boolean> {
  if (!(await isCommandAvailable(command))) return false
  try {
    if (usesWindowsShellWrapper(command)) {
      await execFileAsync('cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
        windowsHide: true,
        timeout: 20_000,
      })
      return true
    }
    await execFileAsync(command, args, { windowsHide: true, timeout: 20_000 })
    return true
  } catch {
    return false
  }
}

async function isDockerRunning(): Promise<{ ok: boolean; detail: string }> {
  if (!(await isCommandAvailable('docker'))) {
    return { ok: false, detail: 'Comando docker não encontrado no PATH.' }
  }
  try {
    await execFileAsync('docker', ['info'], { windowsHide: true, timeout: 30_000 })
    return { ok: true, detail: 'Docker respondeu a docker info.' }
  } catch {
    return {
      ok: false,
      detail: 'Docker instalado, mas não está em execução (inicie Docker Desktop no Windows).',
    }
  }
}

function readMinNodeMajor(manifest: ServerManifest): number {
  const req = manifest.requirements?.node as { minMajorVersion?: unknown } | undefined
  const major = req?.minMajorVersion
  return typeof major === 'number' && major > 0 ? major : 20
}

function planNeedsBashOnWindows(manifest: ServerManifest, platform: ManifestPlatform): boolean {
  if (platform !== 'windows') return false
  const plan = buildPhaseExecutionPlan(manifest, { platform, overlayEnabled: false })
  return plan.phases.some(
    (item) =>
      item.status === 'run' &&
      item.note?.includes('bash') === true,
  )
}

/**
 * Etapas 6–12: valida ferramentas exigidas pelo manifesto antes de executar installPlan.
 */
export async function checkManifestServerPrerequisites(
  manifest: ServerManifest,
  options: { skipDockerCheck?: boolean; omitGitCheck?: boolean } = {},
): Promise<ManifestPrerequisitesResult> {
  const platform = detectManifestPlatform()
  if (!platform) {
    return {
      ok: false,
      platform: null,
      missing: [
        {
          tool: 'Sistema operacional',
          reason: 'Perfil supabase-local-v1 suporta apenas Windows e Linux.',
          step: 'Pré-requisitos',
        },
      ],
    }
  }

  const missing: ManifestPrerequisiteIssue[] = []
  const checked: string[] = []
  const minNode = readMinNodeMajor(manifest)

  if (options.omitGitCheck) {
    checked.push('Git (dispensado — payload OMPS empacotado verificado)')
  } else if (!(await toolRuns('git'))) {
    missing.push({
      tool: 'Git',
      reason: 'Necessário para clonar e atualizar o repositório AcompSolemp.',
      step: 'Obter código-fonte',
    })
  } else checked.push('Git')

  if (!(await toolRuns('node'))) {
    missing.push({
      tool: 'Node.js',
      reason: `Necessário para scripts .mjs do servidor-lan (manifesto exige Node ${minNode}+).`,
      step: 'Scripts servidor-lan',
    })
  } else {
    const major = await readNodeMajorVersion()
    if (major !== null && major < minNode) {
      missing.push({
        tool: `Node.js ${minNode}+`,
        reason: `Versão detectada: v${major}. Atualize o Node.js.`,
        step: 'Scripts servidor-lan',
      })
    } else checked.push(`Node.js${major !== null ? ` v${major}` : ''}`)
  }

  if (!(await toolRuns('npm'))) {
    missing.push({
      tool: 'npm',
      reason: 'Usado para dependências do frontend e npm ci em schemas/.',
      step: 'Build LAN',
    })
  } else checked.push('npm')

  if (!options.skipDockerCheck) {
    const docker = await isDockerRunning()
    if (!docker.ok) {
      missing.push({
        tool: 'Docker',
        reason: docker.detail,
        step: 'Supabase local (supabase start)',
      })
    } else checked.push('Docker (em execução)')
  }

  if (!(await toolRuns('supabase', ['--version']))) {
    missing.push({
      tool: 'Supabase CLI',
      reason: 'Necessário para supabase start/stop na raiz do clone (instale: https://supabase.com/docs/guides/cli).',
      step: 'Supabase local',
    })
  } else checked.push('Supabase CLI')

  if (!(await toolRuns('caddy', ['version']))) {
    missing.push({
      tool: 'Caddy',
      reason: 'Proxy HTTP LAN (porta em ACOMOPMS_HTTP_PORT; UI + API mesma origem). Instale Caddy e adicione ao PATH.',
      step: 'Caddy / start-server-lan',
    })
  } else checked.push('Caddy')

  if (!(await toolRuns('psql', ['--version']))) {
    missing.push({
      tool: 'psql',
      reason: 'Exigido pelo manifesto para schema/backup (ou use docker exec conforme documentação do repo).',
      step: 'Banco local',
    })
  } else checked.push('psql')

  if (platform === 'windows') {
    if (!(await toolRuns('powershell', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major']))) {
      missing.push({
        tool: 'PowerShell',
        reason: 'Scripts .ps1 de build, Caddy e firewall no Windows.',
        step: 'Scripts Windows',
      })
    } else checked.push('PowerShell')

    if (planNeedsBashOnWindows(manifest, platform) && !(await isWindowsBashAvailable())) {
      missing.push({
        tool: 'bash (Git Bash ou WSL)',
        reason: 'Fase database.schema usa apply-local-schema (.sh). Instale Git for Windows ou WSL.',
        step: 'apply-local-schema',
      })
    } else if (planNeedsBashOnWindows(manifest, platform)) {
      checked.push('bash')
    }
  } else if (!(await toolRuns('bash', ['--version']))) {
    missing.push({
      tool: 'bash',
      reason: 'Scripts .sh do servidor-lan no Linux.',
      step: 'Scripts Linux',
    })
  } else checked.push('bash')

  if (missing.length > 0) return { ok: false, platform, missing }
  return { ok: true, platform, checked }
}

export function formatManifestPrerequisitesError(missing: ManifestPrerequisiteIssue[]): string {
  return missing.map((item) => `${item.tool}: ${item.reason} (etapa: ${item.step})`).join('\n')
}
