import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  buildPhaseExecutionPlan,
  detectManifestPlatform,
} from '../serverManifest/buildPhaseExecutionPlan.ts'
import type { ServerManifest } from '../serverManifest/types.ts'
import { isWindowsBashAvailable } from '../installation/resolveWindowsBash.ts'
import { isCommandAvailable, usesWindowsShellWrapper } from '../installation/windowsCommands.ts'

const execFileAsync = promisify(execFile)

export type DependencyState =
  | 'ok'
  | 'missing'
  | 'broken'
  | 'needs_manual'
  | 'needs_admin'
  | 'needs_reboot'
  | 'not_applicable'

export type ServerDependencyItem = {
  id: string
  label: string
  state: DependencyState
  detail: string
  critical: boolean
}

async function toolRuns(command: string, args: string[] = ['--version']): Promise<boolean> {
  if (!(await isCommandAvailable(command))) return false
  try {
    if (usesWindowsShellWrapper(command)) {
      await execFileAsync('cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
        windowsHide: true,
        timeout: 25_000,
      })
      return true
    }
    await execFileAsync(command, args, { windowsHide: true, timeout: 25_000 })
    return true
  } catch {
    return false
  }
}

async function readNodeMajor(): Promise<number | null> {
  if (!(await isCommandAvailable('node'))) return null
  try {
    const { stdout } = await execFileAsync('node', ['--version'], { windowsHide: true, timeout: 15_000 })
    const m = /v?(\d+)/.exec(String(stdout).trim())
    return m ? Number(m[1]) : null
  } catch {
    return null
  }
}

async function dockerState(): Promise<{ installed: boolean; running: boolean; detail: string }> {
  if (!(await isCommandAvailable('docker'))) {
    return { installed: false, running: false, detail: 'CLI docker não encontrada no PATH.' }
  }
  try {
    await execFileAsync('docker', ['info'], { windowsHide: true, timeout: 35_000 })
    return { installed: true, running: true, detail: 'Engine respondeu a docker info.' }
  } catch {
    return {
      installed: true,
      running: false,
      detail: 'Docker instalado, mas o Engine não está em execução.',
    }
  }
}

function readMinNodeMajor(manifest: ServerManifest): number {
  const req = manifest.requirements?.node as { minMajorVersion?: unknown } | undefined
  const major = req?.minMajorVersion
  return typeof major === 'number' && major > 0 ? major : 20
}

function needsBashOnWindows(manifest: ServerManifest, platform: 'windows' | 'linux'): boolean {
  if (platform !== 'windows') return true
  const plan = buildPhaseExecutionPlan(manifest, { platform, overlayEnabled: false })
  return plan.phases.some((item) => item.status === 'run' && item.note?.includes('bash') === true)
}

function item(
  id: string,
  label: string,
  state: DependencyState,
  detail: string,
  critical: boolean,
): ServerDependencyItem {
  return { id, label, state, detail, critical }
}

export async function evaluateServerDependencies(input: {
  manifest: ServerManifest
  wingetAvailable: boolean
  wslAvailable: boolean
  isAdmin: boolean
  /** Somente testes: força resultado da checagem de bash no Windows (sem pular validação real em produção). */
  bashAvailableForTest?: boolean
}): Promise<{ dependencies: ServerDependencyItem[]; criticalOk: boolean }> {
  const platform = detectManifestPlatform()
  const dependencies: ServerDependencyItem[] = []
  const minNode = readMinNodeMajor(input.manifest)

  if (!platform) {
    dependencies.push(
      item('os', 'Sistema operacional', 'broken', 'Perfil supabase-local-v1 exige Windows ou Linux.', true),
    )
    return { dependencies, criticalOk: false }
  }

  dependencies.push(
    item(
      'winget',
      'winget (App Installer)',
      input.wingetAvailable ? 'ok' : 'needs_manual',
      input.wingetAvailable
        ? 'Disponível para instalação automática de dependências.'
        : 'Instale “App Installer” pela Microsoft Store para usar “Preparar este computador”.',
      false,
    ),
  )

  if (!(await isCommandAvailable('git'))) {
    dependencies.push(item('git', 'Git', 'missing', 'Necessário para clonar o repositório.', true))
  } else if (!(await toolRuns('git'))) {
    dependencies.push(item('git', 'Git', 'broken', 'Comando git no PATH não responde.', true))
  } else {
    dependencies.push(item('git', 'Git', 'ok', 'git --version OK.', true))
  }

  const nodeMajor = await readNodeMajor()
  if (nodeMajor === null) {
    dependencies.push(
      item('node', `Node.js ${minNode}+`, 'missing', 'Necessário para scripts .mjs do servidor-lan.', true),
    )
  } else if (nodeMajor < minNode) {
    dependencies.push(
      item(
        'node',
        `Node.js ${minNode}+`,
        'broken',
        `Versão detectada: v${nodeMajor}. Atualize o Node.js.`,
        true,
      ),
    )
  } else {
    dependencies.push(item('node', `Node.js ${minNode}+`, 'ok', `Node v${nodeMajor} OK.`, true))
  }

  if (!(await toolRuns('npm'))) {
    dependencies.push(item('npm', 'npm', 'missing', 'Usado em build LAN e npm ci.', true))
  } else {
    dependencies.push(item('npm', 'npm', 'ok', 'npm --version OK.', true))
  }

  const docker = await dockerState()
  if (!docker.installed) {
    dependencies.push(item('docker', 'Docker Desktop', 'missing', docker.detail, true))
  } else if (!docker.running) {
    dependencies.push(
      item(
        'docker',
        'Docker Desktop (Engine)',
        'needs_manual',
        `${docker.detail} Abra o Docker Desktop e aguarde “Engine running”.`,
        true,
      ),
    )
  } else {
    dependencies.push(item('docker', 'Docker Desktop (Engine)', 'ok', docker.detail, true))
  }

  if (!(await toolRuns('supabase', ['--version']))) {
    if (await isCommandAvailable('supabase')) {
      dependencies.push(item('supabase', 'Supabase CLI', 'broken', 'supabase no PATH não responde.', true))
    } else {
      dependencies.push(
        item('supabase', 'Supabase CLI', 'missing', 'Instale via npm install -g supabase após Node.', true),
      )
    }
  } else {
    dependencies.push(item('supabase', 'Supabase CLI', 'ok', 'supabase --version OK.', true))
  }

  if (!(await toolRuns('caddy', ['version']))) {
    dependencies.push(item('caddy', 'Caddy', 'missing', 'Proxy HTTP :8080 (manifest LAN).', true))
  } else {
    dependencies.push(item('caddy', 'Caddy', 'ok', 'caddy version OK.', true))
  }

  if (!(await toolRuns('psql', ['--version']))) {
    dependencies.push(
      item('psql', 'Cliente psql', 'missing', 'Exigido pelo manifesto para schema/backup.', true),
    )
  } else {
    dependencies.push(item('psql', 'Cliente psql', 'ok', 'psql --version OK.', true))
  }

  const bashRequired = needsBashOnWindows(input.manifest, platform)
  if (platform === 'windows' && bashRequired) {
    const bashOk =
      input.bashAvailableForTest === true
        ? true
        : input.bashAvailableForTest === false
          ? false
          : await isWindowsBashAvailable()
    if (!bashOk) {
      dependencies.push(
        item('bash', 'bash (Git Bash)', 'missing', 'Fase apply-local-schema (.sh). Instale Git for Windows.', true),
      )
    } else {
      dependencies.push(item('bash', 'bash (Git Bash)', 'ok', 'bash funcional (PATH ou Git Bash).', true))
    }
  } else if (platform === 'windows') {
    dependencies.push(item('bash', 'bash (Git Bash)', 'not_applicable', 'Não exigido pelo plano de referência.', false))
  }

  dependencies.push(
    item(
      'wsl',
      'WSL2',
      input.wslAvailable ? 'ok' : 'not_applicable',
      input.wslAvailable
        ? 'WSL detectado (Docker pode usar backend WSL2).'
        : 'Opcional se Git Bash estiver OK; Docker Desktop pode pedir WSL2/reboot.',
      false,
    ),
  )

  if (!input.isAdmin) {
    dependencies.push(
      item(
        'admin',
        'Privilégios administrativos',
        'needs_admin',
        'Firewall e algumas instalações winget podem exigir “Executar como administrador”.',
        false,
      ),
    )
  } else {
    dependencies.push(
      item('admin', 'Privilégios administrativos', 'ok', 'Sessão elevada detectada.', false),
    )
  }

  const criticalOk = dependencies
    .filter((d) => d.critical)
    .every((d) => d.state === 'ok')

  return { dependencies, criticalOk }
}
