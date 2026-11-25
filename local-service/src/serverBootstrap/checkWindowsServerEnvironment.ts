import { execFile } from 'node:child_process'
import os from 'node:os'
import { promisify } from 'node:util'
import {
  checkManifestServerPrerequisites,
  formatManifestPrerequisitesError,
} from '../serverManifest/checkManifestServerPrerequisites.ts'
import { isCommandAvailable } from '../installation/windowsCommands.ts'
import { REFERENCE_SUPABASE_LOCAL_MANIFEST } from './referenceSupabaseLocalManifest.ts'
import {
  evaluateServerDependencies,
  type ServerDependencyItem,
} from './evaluateServerDependencies.ts'

const execFileAsync = promisify(execFile)

export type ServerEnvironmentHint = {
  id: string
  severity: 'info' | 'warning' | 'action'
  message: string
}

export type ServerBootstrapStatus = {
  ok: boolean
  readyForManifestInstall: boolean
  platform: 'windows' | 'linux' | null
  os: { label: string; build?: string }
  isAdmin: boolean
  wingetAvailable: boolean
  wsl: { available: boolean; detail: string }
  docker: { installed: boolean; running: boolean; detail: string }
  dependencies: ServerDependencyItem[]
  toolchain: { ok: boolean; checked: string[]; missing: { tool: string; reason: string; step: string }[] }
  hints: ServerEnvironmentHint[]
  bootstrapScriptAvailable: boolean
  summary: string
}

async function readWindowsOsLabel(): Promise<{ label: string; build?: string }> {
  if (process.platform !== 'win32') {
    return { label: os.type() }
  }
  try {
    const { stdout } = await execFileAsync(
      'cmd.exe',
      ['/d', '/s', '/c', 'ver'],
      { windowsHide: true, timeout: 10_000 },
    )
    return { label: String(stdout).trim() || os.release() }
  } catch {
    return { label: `Windows ${os.release()}` }
  }
}

async function isProcessElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return process.getuid?.() === 0
  try {
    await execFileAsync('net', ['session'], { windowsHide: true, timeout: 8_000 })
    return true
  } catch {
    return false
  }
}

async function readWslStatus(): Promise<{ available: boolean; detail: string }> {
  if (process.platform !== 'win32') {
    return { available: true, detail: 'WSL não se aplica fora do Windows.' }
  }
  try {
    const { stdout } = await execFileAsync('wsl', ['--status'], { windowsHide: true, timeout: 15_000 })
    const text = String(stdout).trim()
    if (/wsl/i.test(text) && !/not installed/i.test(text)) {
      return { available: true, detail: text.split('\n')[0]?.trim() || 'WSL disponível.' }
    }
    return { available: false, detail: text || 'WSL não configurado.' }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (/not recognized|não reconhecido/i.test(msg)) {
      return { available: false, detail: 'Comando wsl não encontrado (WSL opcional se Git Bash estiver OK).' }
    }
    return { available: false, detail: 'WSL não disponível ou não instalado.' }
  }
}

async function readDockerState(): Promise<{ installed: boolean; running: boolean; detail: string }> {
  if (!(await isCommandAvailable('docker'))) {
    return { installed: false, running: false, detail: 'Docker CLI não encontrado no PATH.' }
  }
  try {
    await execFileAsync('docker', ['info'], { windowsHide: true, timeout: 35_000 })
    return { installed: true, running: true, detail: 'Docker Engine respondeu a docker info.' }
  } catch {
    return {
      installed: true,
      running: false,
      detail: 'Docker instalado, mas o Engine não está em execução (abra Docker Desktop e aguarde).',
    }
  }
}

export async function getServerBootstrapStatus(input: {
  bootstrapScriptAvailable: boolean
}): Promise<ServerBootstrapStatus> {
  const hints: ServerEnvironmentHint[] = []
  const osInfo = await readWindowsOsLabel()
  const isAdmin = await isProcessElevated()
  const wsl = await readWslStatus()
  const docker = await readDockerState()
  const wingetAvailable = await isCommandAvailable('winget')

  if (!wingetAvailable) {
    hints.push({
      id: 'winget',
      severity: 'action',
      message:
        'Instale o App Installer (Microsoft Store) para o botão “Preparar este computador” instalar dependências via winget.',
    })
  }

  if (!isAdmin) {
    hints.push({
      id: 'admin',
      severity: 'warning',
      message:
        'Algumas fases do manifesto (firewall) exigem PowerShell como Administrador. A instalação pode pedir elevação depois.',
    })
  }

  if (docker.installed && !docker.running) {
    hints.push({
      id: 'docker-start',
      severity: 'action',
      message:
        'Abra o Docker Desktop e aguarde “Engine running”, depois clique em “Verificar de novo”.',
    })
  }

  if (!docker.installed) {
    hints.push({
      id: 'docker-install',
      severity: 'action',
      message: 'Docker Desktop é necessário para Supabase local. Use “Preparar este computador”.',
    })
  }

  if (process.platform === 'win32' && !wsl.available) {
    hints.push({
      id: 'wsl-optional',
      severity: 'info',
      message: 'WSL não detectado; Git Bash costuma bastar. Docker pode pedir WSL2 e reinício.',
    })
  }

  const { dependencies, criticalOk } = await evaluateServerDependencies({
    manifest: REFERENCE_SUPABASE_LOCAL_MANIFEST,
    wingetAvailable,
    wslAvailable: wsl.available,
    isAdmin,
  })

  const needsPathRefresh = dependencies.some(
    (d) => d.state === 'missing' && /PATH|reinicie o Manager/i.test(d.detail),
  )
  if (needsPathRefresh) {
    hints.push({
      id: 'path-refresh',
      severity: 'action',
      message: 'Feche e abra o atalho do Manager para recarregar o PATH após instalações.',
    })
  }

  const toolchain = await checkManifestServerPrerequisites(REFERENCE_SUPABASE_LOCAL_MANIFEST)
  const missing = toolchain.ok ? [] : toolchain.missing
  const checked = toolchain.ok ? toolchain.checked : []

  if (!criticalOk) {
    hints.push({
      id: 'toolchain',
      severity: 'action',
      message: 'Conclua a preparação abaixo antes de instalar o AcompSolemp pelo manifesto.',
    })
  }

  const ok = criticalOk
  const readyForManifestInstall = ok

  const summary = ok
    ? 'Servidor pronto para cadastrar, analisar e instalar sistemas com perfil supabase-local-v1.'
    : !toolchain.ok
      ? `Preparação pendente:\n${formatManifestPrerequisitesError(missing)}`
      : docker.detail

  return {
    ok,
    readyForManifestInstall,
    platform: toolchain.platform,
    os: osInfo,
    isAdmin,
    wingetAvailable,
    wsl,
    docker,
    dependencies,
    toolchain: { ok: toolchain.ok, checked, missing },
    hints,
    bootstrapScriptAvailable: input.bootstrapScriptAvailable,
    summary,
  }
}

export type { ServerDependencyItem, DependencyState } from './evaluateServerDependencies.ts'
