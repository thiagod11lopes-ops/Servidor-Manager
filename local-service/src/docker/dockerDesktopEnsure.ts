import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { DOCKER_INSTALL_PAUSE_MESSAGE } from '../installation/installDockerPause.ts'
import { isCommandAvailable, usesWindowsShellWrapper } from '../installation/windowsCommands.ts'

const execFileAsync = promisify(execFile)

const DEFAULT_WAIT_MS = 120_000
const POLL_MS = 2_000

const DOCKER_DESKTOP_EXE_CANDIDATES = [
  'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
  path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
  path.join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Docker',
    'Docker',
    'Docker Desktop.exe',
  ),
  path.join(
    process.env.ProgramFiles ?? 'C:\\Program Files',
    'Docker',
    'Docker',
    'Docker Desktop Launcher.exe',
  ),
]

const DEFAULT_INSTALL_AUTO_WAIT_MS = 90_000

export type DockerEngineState = {
  installed: boolean
  running: boolean
  detail: string
  desktopUiRunning: boolean
}

export type DockerEnsureFailureCode = 'not_installed' | 'start_failed' | 'timeout' | 'unsupported_platform'

export type DockerEnsureResult =
  | { ok: true; state: DockerEngineState; message: string }
  | { ok: false; code: DockerEnsureFailureCode; state: DockerEngineState; message: string }

let ensureInFlight: Promise<DockerEnsureResult> | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveDockerDesktopExe(): string | null {
  for (const candidate of DOCKER_DESKTOP_EXE_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // ignore
    }
  }
  return null
}

async function isDockerDesktopUiRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  try {
    const { stdout } = await execFileAsync(
      'tasklist',
      ['/FI', 'IMAGENAME eq Docker Desktop.exe', '/FO', 'CSV', '/NH'],
      { windowsHide: true, timeout: 15_000 },
    )
    return String(stdout).toLowerCase().includes('docker desktop.exe')
  } catch {
    return false
  }
}

/** Engine pronto (`docker info`), não confundir com UI aberta. */
export async function probeDockerEngine(): Promise<DockerEngineState> {
  const desktopUiRunning = await isDockerDesktopUiRunning()
  if (!(await isCommandAvailable('docker'))) {
    const exe = resolveDockerDesktopExe()
    return {
      installed: Boolean(exe),
      running: false,
      desktopUiRunning,
      detail: exe
        ? 'Docker Desktop parece instalado, mas a CLI docker não está no PATH.'
        : 'Docker Desktop não encontrado (CLI docker ausente).',
    }
  }

  try {
    if (usesWindowsShellWrapper('docker')) {
      await execFileAsync('cmd.exe', ['/d', '/s', '/c', 'docker info'], {
        windowsHide: true,
        timeout: 35_000,
      })
    } else {
      await execFileAsync('docker', ['info'], { windowsHide: true, timeout: 35_000 })
    }
    return {
      installed: true,
      running: true,
      desktopUiRunning,
      detail: 'Docker Engine respondeu a docker info.',
    }
  } catch {
    return {
      installed: true,
      running: false,
      desktopUiRunning,
      detail: desktopUiRunning
        ? 'Docker Desktop está aberto, mas o Engine ainda não responde (aguarde “Engine running”).'
        : 'Docker instalado, mas o Engine não está em execução.',
    }
  }
}

function quotePowerShellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function launchDockerDesktopOnce(): Promise<{ ok: boolean; detail: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, detail: 'Início automático do Docker Desktop disponível apenas no Windows.' }
  }

  const exe = resolveDockerDesktopExe()
  if (!exe) {
    return { ok: false, detail: 'Docker Desktop.exe não encontrado em Program Files.' }
  }

  if (await isDockerDesktopUiRunning()) {
    return { ok: true, detail: 'Docker Desktop já estava em execução (processo UI).' }
  }

  const startViaPowerShell = async (): Promise<void> => {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Start-Process -FilePath ${quotePowerShellSingleQuoted(exe)} -WindowStyle Minimized`,
      ],
      { windowsHide: true, timeout: 45_000 },
    )
  }

  const startViaDetachedSpawn = (): void => {
    const child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  }

  try {
    await startViaPowerShell()
    await sleep(1_500)
    if (await isDockerDesktopUiRunning()) {
      return { ok: true, detail: 'Docker Desktop iniciado via Start-Process.' }
    }
    startViaDetachedSpawn()
    await sleep(1_000)
    if (await isDockerDesktopUiRunning()) {
      return { ok: true, detail: 'Docker Desktop iniciado.' }
    }
    return {
      ok: true,
      detail:
        'Comando de início do Docker Desktop enviado; aguardando processo UI (pode levar alguns segundos).',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      startViaDetachedSpawn()
      return { ok: true, detail: `Docker Desktop iniciado (fallback após: ${message}).` }
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      return {
        ok: false,
        detail: `Não foi possível iniciar Docker Desktop: ${message} (fallback: ${fallbackMessage})`,
      }
    }
  }
}

/** Inicia Docker Desktop uma vez (sem aguardar Engine). */
export async function launchDockerDesktop(): Promise<{ ok: boolean; detail: string }> {
  return launchDockerDesktopOnce()
}

/**
 * Durante a instalação: tenta abrir Docker Desktop automaticamente e aguarda o Engine
 * por um tempo limitado antes de devolver controle à UI (modal).
 */
export async function autoStartAndWaitDockerEngine(input: {
  autoWaitMs?: number
  onProgress?: (message: string) => void
} = {}): Promise<DockerEnsureResult> {
  const autoWaitMs = input.autoWaitMs ?? DEFAULT_INSTALL_AUTO_WAIT_MS
  let state = await probeDockerEngine()
  if (state.running) {
    return { ok: true, state, message: state.detail }
  }

  if (!state.installed) {
    return {
      ok: false,
      code: 'not_installed',
      state,
      message:
        'Docker Desktop é necessário para este sistema (Supabase local). Instale pelo painel “Preparar este computador” no Dashboard ou manualmente.',
    }
  }

  if (process.platform !== 'win32') {
    const deadline = Date.now() + autoWaitMs
    while (Date.now() < deadline) {
      state = await probeDockerEngine()
      if (state.running) {
        return { ok: true, state, message: 'Docker Engine pronto.' }
      }
      input.onProgress?.('Aguardando Docker Engine (Linux)…')
      await sleep(POLL_MS)
    }
    state = await probeDockerEngine()
    return {
      ok: false,
      code: 'timeout',
      state,
      message:
        'Docker Engine não respondeu a docker info. Inicie o serviço (ex.: sudo systemctl start docker) e retome a instalação.',
    }
  }

  input.onProgress?.('Iniciando Docker Desktop…')
  const launch = await launchDockerDesktopOnce()
  if (!launch.ok) {
    state = await probeDockerEngine()
    return {
      ok: false,
      code: 'start_failed',
      state,
      message: launch.detail,
    }
  }

  const deadline = Date.now() + autoWaitMs
  while (Date.now() < deadline) {
    state = await probeDockerEngine()
    if (state.running) {
      return { ok: true, state, message: 'Docker Engine pronto.' }
    }
    input.onProgress?.(
      state.desktopUiRunning
        ? 'Docker Desktop aberto — aguardando Engine…'
        : 'Aguardando Docker Desktop e Engine…',
    )
    await sleep(POLL_MS)
  }

  state = await probeDockerEngine()
  return {
    ok: false,
    code: 'timeout',
    state,
    message: DOCKER_INSTALL_PAUSE_MESSAGE,
  }
}

export async function ensureDockerEngineReady(input: {
  timeoutMs?: number
  onProgress?: (message: string) => void
} = {}): Promise<DockerEnsureResult> {
  if (ensureInFlight) return ensureInFlight

  const run = async (): Promise<DockerEnsureResult> => {
    const timeoutMs = input.timeoutMs ?? DEFAULT_WAIT_MS
    let state = await probeDockerEngine()
    if (state.running) {
      return { ok: true, state, message: state.detail }
    }

    if (!state.installed) {
      return {
        ok: false,
        code: 'not_installed',
        state,
        message:
          'Docker Desktop é necessário para este sistema (Supabase local). Instale pelo painel “Preparar este computador” no Dashboard ou manualmente.',
      }
    }

    if (process.platform !== 'win32') {
      return {
        ok: false,
        code: 'unsupported_platform',
        state,
        message: 'Inicie o Docker manualmente neste sistema operacional e tente novamente.',
      }
    }

    input.onProgress?.('Iniciando Docker Desktop…')
    const launch = await launchDockerDesktopOnce()
    if (!launch.ok) {
      state = await probeDockerEngine()
      return {
        ok: false,
        code: 'start_failed',
        state,
        message: launch.detail,
      }
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      state = await probeDockerEngine()
      if (state.running) {
        return { ok: true, state, message: 'Docker Engine pronto.' }
      }
      input.onProgress?.(
        state.desktopUiRunning
          ? 'Docker Desktop aberto — aguardando Engine…'
          : 'Aguardando Docker Desktop e Engine…',
      )
      await sleep(POLL_MS)
    }

    state = await probeDockerEngine()
    return {
      ok: false,
      code: 'timeout',
      state,
      message:
        'O Docker Engine não ficou pronto a tempo. Confirme Docker Desktop (“Engine running”) e use “Tentar novamente”.',
    }
  }

  ensureInFlight = run().finally(() => {
    ensureInFlight = null
  })

  return ensureInFlight
}
