import fs from 'node:fs/promises'
import type { ChildProcess } from 'node:child_process'
import { applyProjectEnvironmentTemplate } from '../installation/applyProjectEnvironmentTemplate.ts'
import { patchProjectEnvForLan } from '../installation/patchProjectEnvForLan.ts'
import { resolveProductionStartCommand } from '../installation/resolveProductionStart.ts'
import { getSystemsRoot } from '../installation/paths.ts'
import {
  getManifestLanRuntimeStatus,
  isManifestLanSystem,
  restartManifestLanStack,
  startManifestLanStack,
  stopManifestLanStack,
} from './manifestLanRuntime.ts'
import { manifestToPlan, readInstallationManifest } from './installationManifest.ts'
import { prepareRuntimeLogs } from './logWriter.ts'
import { getProcessPlatform } from './platform/index.ts'
import { buildApplicationEnv } from './env/buildApplicationEnv.ts'
import { spawnManagedProcess } from './platform/spawnManagedProcess.ts'
import { readRuntimeState, writeRuntimeState } from './runtimeStateStore.ts'
import {
  isWindowsServiceInstalled,
  reconcileSystemServiceState,
  restartSystemService,
  startSystemService,
  stopSystemService,
} from './service/serviceManager.ts'
import { buildLanAccessUrl } from '../config/networkAccess.ts'
import { sanitizePublicLoginUrl } from '../config/lanPublicUrl.ts'
import { attachRemoteAccessToResponse } from './attachSystemRemoteAccess.ts'
import type { RuntimeActionResponse, RuntimeState, RuntimeStateSnapshot } from './types.ts'

function resolvePublishedHttpPort(status: RuntimeStateSnapshot): number {
  const raw = status.port
  if (typeof raw === 'number' && raw > 0 && raw !== 4173 && raw !== 5173) return raw
  return 8080
}

function enrichRuntimeStatus(status: RuntimeStateSnapshot): RuntimeStateSnapshot {
  const httpPort = resolvePublishedHttpPort(status)
  const rawUrl = status.loginUrl ?? status.lanAccessUrl
  const sanitized =
    (typeof rawUrl === 'string' && rawUrl.trim()
      ? sanitizePublicLoginUrl(rawUrl.trim(), httpPort)
      : null) ?? buildLanAccessUrl(httpPort, '/login')
  return {
    ...status,
    port: httpPort,
    runtimeKind: status.runtimeKind ?? undefined,
    loginUrl: sanitized,
    lanAccessUrl: sanitized,
  }
}

type ManagedHandle = {
  child: ChildProcess
  pid: number
}

const platform = getProcessPlatform()
const activeHandles = new Map<string, ManagedHandle>()
const startLocks = new Set<string>()

function nowIso(): string {
  return new Date().toISOString()
}

function computeUptimeSeconds(startedAt: string | null): number | null {
  if (!startedAt) return null
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return null
  return Math.max(0, Math.floor((Date.now() - started) / 1000))
}

function defaultPort(manifest: Awaited<ReturnType<typeof readInstallationManifest>>): number | null {
  const start =
    manifest?.runtimePlan?.startCommand ?? manifest?.runtimePlan?.devCommand ?? ''
  if (start.includes('preview')) return 4173
  if (start.includes('dev')) return 5173
  const ports = manifest?.runtimePlan?.identifiedPorts ?? []
  if (ports.includes(4173)) return 4173
  return ports[0] ?? null
}

function portForStartCommand(
  manifest: Awaited<ReturnType<typeof readInstallationManifest>>,
  startLabel: string,
): number | null {
  if (startLabel.includes('preview')) return 4173
  if (startLabel.includes('dev')) return 5173
  return defaultPort(manifest)
}

async function ensureBaselineState(
  systemId: string,
  manifest: NonNullable<Awaited<ReturnType<typeof readInstallationManifest>>>,
): Promise<RuntimeStateSnapshot> {
  const existing = await readRuntimeState(systemId)
  if (existing) return existing

  const baseline: RuntimeStateSnapshot = {
    systemId,
    state: 'instalado',
    pid: null,
    startedAt: null,
    stoppedAt: null,
    uptimeSeconds: null,
    port: defaultPort(manifest),
    workingDirectory: manifest.projectDirectory,
    startCommand: manifest.runtimePlan?.startCommand ?? manifest.runtimePlan?.devCommand ?? null,
    lastError: null,
    updatedAt: nowIso(),
  }
  await writeRuntimeState(baseline)
  return baseline
}

async function reconcileAliveState(state: RuntimeStateSnapshot): Promise<RuntimeStateSnapshot> {
  if (!state.pid) return state

  const alive = await platform.isProcessAlive(state.pid)
  if (alive) {
    if (state.state === 'executando' || state.state === 'iniciando') {
      return {
        ...state,
        state: 'executando',
        uptimeSeconds: computeUptimeSeconds(state.startedAt),
        updatedAt: nowIso(),
      }
    }
    return state
  }

  if (state.state === 'executando' || state.state === 'iniciando') {
    const next: RuntimeStateSnapshot = {
      ...state,
      state: 'parado',
      pid: null,
      stoppedAt: nowIso(),
      uptimeSeconds: null,
      lastError: state.lastError ?? 'Processo encerrado inesperadamente.',
      updatedAt: nowIso(),
    }
    await writeRuntimeState(next)
    activeHandles.delete(state.systemId)
    return next
  }

  if (state.state === 'encerrando') {
    const next: RuntimeStateSnapshot = {
      ...state,
      state: 'parado',
      pid: null,
      stoppedAt: nowIso(),
      uptimeSeconds: null,
      updatedAt: nowIso(),
    }
    await writeRuntimeState(next)
    return next
  }

  return state
}

function attachExitListener(systemId: string, child: ChildProcess, pid: number): void {
  child.once('exit', (code, signal) => {
    activeHandles.delete(systemId)
    void (async () => {
      const current = await readRuntimeState(systemId)
      if (!current || current.pid !== pid) return
      if (current.state !== 'executando' && current.state !== 'iniciando') return

      const message =
        signal != null
          ? `Processo encerrado (sinal ${signal}).`
          : `Processo encerrado (código ${code ?? 'desconhecido'}).`

      await writeRuntimeState({
        ...current,
        state: code === 0 ? 'parado' : 'erro',
        pid: null,
        stoppedAt: nowIso(),
        uptimeSeconds: null,
        lastError: code === 0 ? null : message,
        updatedAt: nowIso(),
      })
    })()
  })
}

async function runtimeFromService(systemId: string): Promise<RuntimeActionResponse | null> {
  if (!(await isWindowsServiceInstalled(systemId))) return null
  await reconcileSystemServiceState(systemId)
  const state = await readRuntimeState(systemId)
  if (!state) {
    return { ok: false, message: 'Estado de runtime indisponível.' }
  }
  return {
    ok: true,
    status: enrichRuntimeStatus({ ...state, uptimeSeconds: computeUptimeSeconds(state.startedAt) }),
  }
}

export async function getRuntimeStateSnapshotForSystem(
  systemId: string,
): Promise<RuntimeActionResponse> {
  const manifest = await readInstallationManifest(systemId)
  if (!manifest) {
    return { ok: false, message: 'Instalação não encontrada para este sistema.' }
  }

  if (await isManifestLanSystem(systemId, manifest)) {
    return await getManifestLanRuntimeStatus(systemId, manifest)
  }

  if (await isWindowsServiceInstalled(systemId)) {
    const serviceView = await runtimeFromService(systemId)
    if (serviceView) return serviceView
  }

  let state = await ensureBaselineState(systemId, manifest)
  state = await reconcileAliveState(state)

  return {
    ok: true,
    status: enrichRuntimeStatus({
      ...state,
      uptimeSeconds: computeUptimeSeconds(state.startedAt),
    }),
  }
}

export async function getSystemRuntimeStatus(systemId: string): Promise<RuntimeActionResponse> {
  return attachRemoteAccessToResponse(await getRuntimeStateSnapshotForSystem(systemId))
}

export async function startManagedSystem(systemId: string): Promise<RuntimeActionResponse> {
  if (await isWindowsServiceInstalled(systemId)) {
    const result = await startSystemService(systemId)
    if (!result.ok) {
      return { ok: false, message: result.message, status: undefined }
    }
    const view = await runtimeFromService(systemId)
    return view ?? { ok: false, message: 'Estado indisponível.' }
  }

  if (startLocks.has(systemId)) {
    return { ok: false, message: 'Inicialização já em andamento.' }
  }

  startLocks.add(systemId)
  try {
    const manifest = await readInstallationManifest(systemId)
    if (!manifest) {
      return { ok: false, message: 'Instalação não encontrada para este sistema.' }
    }

    if (await isManifestLanSystem(systemId, manifest)) {
      return startManifestLanStack(systemId, manifest)
    }

    if (!manifest.runtimePlan) {
      const status = await ensureBaselineState(systemId, manifest)
      return {
        ok: false,
        message:
          'Manifesto sem plano de execução. Reinstale o sistema para registrar o comando de início validado.',
        status,
      }
    }

    const plan = manifestToPlan(manifest)
    if (!plan) {
      return {
        ok: false,
        message: 'Plano de instalação inválido ou incompleto no manifesto.',
      }
    }

    await applyProjectEnvironmentTemplate(manifest.projectDirectory)
    await patchProjectEnvForLan(manifest.projectDirectory)

    const startCommand = await resolveProductionStartCommand(plan, manifest.projectDirectory)
    if (!startCommand) {
      const status = await ensureBaselineState(systemId, manifest)
      return {
        ok: false,
        message: 'Este sistema não possui um comando de inicialização válido.',
        status: {
          ...status,
          state: 'instalado',
          lastError:
            'Comando de execução não identificado (start/dev). Início bloqueado pelo Manager.',
          updatedAt: nowIso(),
        },
      }
    }

    let state = await ensureBaselineState(systemId, manifest)
    state = await reconcileAliveState(state)

    if (state.state === 'executando' && state.pid && (await platform.isProcessAlive(state.pid))) {
      return {
        ok: false,
        message: 'Sistema já está em execução.',
        status: enrichRuntimeStatus({ ...state, uptimeSeconds: computeUptimeSeconds(state.startedAt) }),
      }
    }

    if (state.state === 'iniciando' || state.state === 'encerrando') {
      return {
        ok: false,
        message: 'Aguarde a operação em andamento antes de iniciar novamente.',
        status: state,
      }
    }

    const projectDir = manifest.projectDirectory
    try {
      await fs.access(projectDir)
    } catch {
      return { ok: false, message: 'Diretório do projeto instalado não encontrado.' }
    }

    const starting: RuntimeStateSnapshot = {
      ...state,
      state: 'iniciando',
      pid: null,
      startedAt: null,
      stoppedAt: null,
      uptimeSeconds: null,
      workingDirectory: projectDir,
      startCommand: startCommand.label,
      lastError: null,
      port: portForStartCommand(manifest, startCommand.label),
      updatedAt: nowIso(),
    }
    await writeRuntimeState(starting)

    const { stdoutPath, stderrPath } = await prepareRuntimeLogs(systemId)
    const extraEnv = await buildApplicationEnv(systemId)
    const child = spawnManagedProcess(startCommand, projectDir, stdoutPath, stderrPath, {
      detached: true,
      env: extraEnv,
    })
    const pid = child.pid
    if (!pid) {
      const failed: RuntimeStateSnapshot = {
        ...starting,
        state: 'erro',
        lastError: 'Falha ao obter PID do processo iniciado.',
        updatedAt: nowIso(),
      }
      await writeRuntimeState(failed)
      return { ok: false, message: failed.lastError, status: failed }
    }

    activeHandles.set(systemId, { child, pid })
    attachExitListener(systemId, child, pid)

    const running: RuntimeStateSnapshot = {
      ...starting,
      state: 'executando',
      pid,
      startedAt: nowIso(),
      updatedAt: nowIso(),
    }
    await writeRuntimeState(running)

    return {
      ok: true,
      status: enrichRuntimeStatus({ ...running, uptimeSeconds: 0 }),
    }
  } finally {
    startLocks.delete(systemId)
  }
}

export async function stopManagedSystem(systemId: string): Promise<RuntimeActionResponse> {
  if (await isWindowsServiceInstalled(systemId)) {
    const result = await stopSystemService(systemId)
    if (!result.ok) {
      return { ok: false, message: result.message }
    }
    const view = await runtimeFromService(systemId)
    return view ?? { ok: false, message: 'Estado indisponível.' }
  }

  const manifest = await readInstallationManifest(systemId)
  if (!manifest) {
    return { ok: false, message: 'Instalação não encontrada para este sistema.' }
  }

  if (await isManifestLanSystem(systemId, manifest)) {
    return stopManifestLanStack(systemId, manifest)
  }

  let state = await ensureBaselineState(systemId, manifest)
  state = await reconcileAliveState(state)

  const registeredPid = state.pid
  if (!registeredPid) {
    const idle: RuntimeStateSnapshot = {
      ...state,
      state: state.state === 'erro' ? 'erro' : 'parado',
      updatedAt: nowIso(),
    }
    await writeRuntimeState(idle)
    return { ok: true, status: enrichRuntimeStatus(idle) }
  }

  const handle = activeHandles.get(systemId)
  if (handle && handle.pid !== registeredPid) {
    return { ok: false, message: 'Estado inconsistente do processo gerenciado.' }
  }

  const stopping: RuntimeStateSnapshot = {
    ...state,
    state: 'encerrando',
    updatedAt: nowIso(),
  }
  await writeRuntimeState(stopping)

  try {
    await platform.terminateProcessTree(registeredPid)
  } catch (error) {
    const stillAlive = await platform.isProcessAlive(registeredPid)
    if (stillAlive) {
      const message = error instanceof Error ? error.message : 'Falha ao encerrar processo.'
      const failed: RuntimeStateSnapshot = {
        ...stopping,
        state: 'erro',
        lastError: message,
        updatedAt: nowIso(),
      }
      await writeRuntimeState(failed)
      return { ok: false, message, status: failed }
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const alive = await platform.isProcessAlive(registeredPid)
    if (!alive) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  activeHandles.delete(systemId)

  const stopped: RuntimeStateSnapshot = {
    ...stopping,
    state: 'parado',
    pid: null,
    stoppedAt: nowIso(),
    uptimeSeconds: null,
    updatedAt: nowIso(),
  }
  await writeRuntimeState(stopped)

  return { ok: true, status: enrichRuntimeStatus(stopped) }
}

export async function restartManagedSystem(systemId: string): Promise<RuntimeActionResponse> {
  if (await isWindowsServiceInstalled(systemId)) {
    const result = await restartSystemService(systemId)
    if (!result.ok) {
      return { ok: false, message: result.message }
    }
    const view = await runtimeFromService(systemId)
    return view ?? { ok: false, message: 'Estado indisponível.' }
  }

  const manifest = await readInstallationManifest(systemId)
  if (manifest && (await isManifestLanSystem(systemId, manifest))) {
    return restartManifestLanStack(systemId, manifest)
  }

  const stopResult = await stopManagedSystem(systemId)
  if (!stopResult.ok && stopResult.status?.state === 'executando') {
    return stopResult
  }

  return startManagedSystem(systemId)
}

export type RuntimeSummary = {
  installed: number
  running: number
  stopped: number
  error: number
}

const RUNNING: RuntimeState[] = ['executando', 'iniciando']
const STOPPED: RuntimeState[] = ['parado', 'instalado', 'encerrando']

export async function collectRuntimeSummary(): Promise<RuntimeSummary> {
  const summary: RuntimeSummary = { installed: 0, running: 0, stopped: 0, error: 0 }

  let entries: string[] = []
  try {
    entries = await fs.readdir(getSystemsRoot())
  } catch {
    return summary
  }

  for (const entry of entries) {
    let manifest: Awaited<ReturnType<typeof readInstallationManifest>> = null
    try {
      manifest = await readInstallationManifest(entry)
    } catch {
      manifest = null
    }
    if (!manifest) continue
    summary.installed += 1

    const status = await getSystemRuntimeStatus(entry)
    const state = status.ok ? status.status.state : 'erro'
    if (state === 'erro') summary.error += 1
    else if (RUNNING.includes(state)) summary.running += 1
    else if (STOPPED.includes(state)) summary.stopped += 1
  }

  return summary
}
