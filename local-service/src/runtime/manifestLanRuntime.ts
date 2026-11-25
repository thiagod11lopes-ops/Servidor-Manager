import fs from 'node:fs/promises'
import { getServerManifestStatePath, getManifestPath } from '../installation/paths.ts'
import { buildLanAccessUrl } from '../config/networkAccess.ts'
import { sanitizePublicLoginUrl } from '../config/lanPublicUrl.ts'
import { ensureServidorEnvLanHostCoherent } from '../serverManifest/ensureServidorEnvLanHostCoherent.ts'
import { detectManifestPlatform } from '../serverManifest/buildPhaseExecutionPlan.ts'
import { fetchServerConnectionJson, resolveLanHttpOrigin } from '../serverManifest/fetchServerConnection.ts'
import { loadServerManifest } from '../serverManifest/loadServerManifest.ts'
import { loadServidorEnvIntoProcessEnv } from '../serverManifest/loadServidorEnvIntoProcessEnv.ts'
import { readServerManifestState } from '../serverManifest/readServerManifestState.ts'
import {
  resolveProxyStartScript,
  resolveProxyStopScript,
} from '../serverManifest/resolveManifestRuntimeScripts.ts'
import { runManifestScript } from '../serverManifest/scriptRunner.ts'
import { ensureLanHttpPortForSystem } from '../serverManifest/lanHttpPortGuard.ts'
import {
  lanBuildHttpPortMismatch,
  regenerateLanHttpPortConsumers,
} from '../serverManifest/regenerateLanHttpPortConsumers.ts'
import { runProxyStartWithPortRecovery } from '../serverManifest/proxyStartPortRecovery.ts'
import { supabaseEnsureStarted, supabaseIsRunning } from '../serverManifest/supabaseLocalCommands.ts'
import { isManifestLanInstallation, type InstallationManifest } from './installationManifest.ts'
import { readRuntimeState, writeRuntimeState } from './runtimeStateStore.ts'
import { probeLocalHttpUrl } from '../network/probeLocalHttpUrl.ts'
import { verifyManifestLanReadiness } from '../serverManifest/verifyManifestLanReadiness.ts'
import { loadActiveServidorOmpsFixedLanPolicy } from '../products/servidorOmpsFixedLanRuntime.ts'
import {
  FIXED_LAN_HTTP_PORT_CONFLICT_CODE,
  toFixedLanPort8080ConflictApiSnapshot,
} from '../serverManifest/fixedLanPort8080Conflict.ts'
import { writeOmpsSystemHttpPort } from '../serverManifest/ompsSystemPorts.ts'
import { prepareServidorEnv } from '../serverManifest/prepareServidorEnv.ts'
import type { RuntimeActionResponse, RuntimeStateSnapshot } from './types.ts'
import { startOmpsLanDiscoveryForSystem, stopOmpsLanDiscoveryForSystem } from './ompsLanDiscoveryRuntime.ts'

export const MANIFEST_LAN_START_LABEL = 'Supabase local + Caddy (manifest LAN)'
export const MANIFEST_LAN_RUNTIME_KIND = 'manifest-lan' as const

const SCRIPT_TIMEOUT_MS = 900_000
const PORT_PROBE_INTERVAL_MS = 1_000
const PORT_PROBE_MAX_MS = 90_000

const manifestStartLocks = new Set<string>()

function nowIso(): string {
  return new Date().toISOString()
}

function computeUptimeSeconds(startedAt: string | null): number | null {
  if (!startedAt) return null
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return null
  return Math.max(0, Math.floor((Date.now() - started) / 1000))
}

function resolveHttpPort(manifest: InstallationManifest, state: Awaited<ReturnType<typeof readServerManifestState>>): number {
  const fromState = state?.servidorEnv?.httpPort
  if (typeof fromState === 'number' && fromState > 0 && fromState !== 4173 && fromState !== 5173) {
    return fromState
  }
  const ports = manifest.runtimePlan?.identifiedPorts ?? []
  const published = ports.find((p) => p !== 4173 && p !== 5173)
  if (published != null) return published
  return 8080
}

async function isLanHttpUp(port: number): Promise<boolean> {
  const urls = [`http://127.0.0.1:${port}/`, `http://127.0.0.1:${port}/login`]
  for (const url of urls) {
    const result = await probeLocalHttpUrl(url, { timeoutMs: 4_000 })
    if (result.ok && result.responded) return true
  }
  return false
}

async function waitForLanHttp(port: number, expectUp: boolean): Promise<boolean> {
  const deadline = Date.now() + PORT_PROBE_MAX_MS
  while (Date.now() < deadline) {
    const up = await isLanHttpUp(port)
    if (up === expectUp) return true
    await new Promise((resolve) => setTimeout(resolve, PORT_PROBE_INTERVAL_MS))
  }
  return expectUp ? await isLanHttpUp(port) : !(await isLanHttpUp(port))
}

async function resolveLoginUrl(input: {
  systemId: string
  manifest: InstallationManifest
  rootDirectory: string
  httpPort: number
  serverManifest: Awaited<ReturnType<typeof loadServerManifest>>
}): Promise<{ loginUrl: string | null; lanAccessUrl: string | null }> {
  const state = await readServerManifestState(input.systemId)
  const priorStoredRaw = state?.serverConnection?.loginUrl ?? input.manifest.serverConnection?.loginUrl

  if (input.serverManifest.found && input.serverManifest.ok) {
    await ensureServidorEnvLanHostCoherent({
      systemId: input.systemId,
      rootDirectory: input.rootDirectory,
      manifest: input.serverManifest.manifest,
      httpPort: input.httpPort,
    })
    const origin = await resolveLanHttpOrigin({
      rootDirectory: input.rootDirectory,
      manifest: input.serverManifest.manifest,
      httpPort: input.httpPort,
    })
    if (!('error' in origin)) {
      const connection = await fetchServerConnectionJson(origin.origin, input.httpPort)
      if (connection.ok) {
        const loginUrl = sanitizePublicLoginUrl(connection.loginUrl, input.httpPort)
        if (loginUrl) {
          await persistSanitizedServerConnection(input.systemId, loginUrl, priorStoredRaw)
          return { loginUrl, lanAccessUrl: loginUrl }
        }
      }
    }
  }

  const storedRaw = priorStoredRaw
  if (storedRaw?.trim()) {
    const sanitized = sanitizePublicLoginUrl(storedRaw.trim(), input.httpPort)
    if (sanitized) {
      await persistSanitizedServerConnection(input.systemId, sanitized, storedRaw)
      return { loginUrl: sanitized, lanAccessUrl: sanitized }
    }
  }

  const fallback = buildLanAccessUrl(input.httpPort, '/login')
  return { loginUrl: fallback, lanAccessUrl: fallback }
}

async function persistSanitizedServerConnection(
  systemId: string,
  loginUrl: string | null,
  priorRaw: string | undefined,
): Promise<void> {
  if (!loginUrl?.trim()) return
  const trimmed = loginUrl.trim()
  if (priorRaw?.trim() === trimmed) return

  try {
    const statePath = getServerManifestStatePath(systemId)
    const state = await readServerManifestState(systemId)
    if (state) {
      await fs.writeFile(
        statePath,
        JSON.stringify(
          {
            ...state,
            serverConnection: { ...state.serverConnection, loginUrl: trimmed },
          },
          null,
          2,
        ),
        'utf8',
      )
    }
  } catch {
    // best-effort — não bloqueia runtime
  }

  try {
    const manifestPath = getManifestPath(systemId)
    const raw = await fs.readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as InstallationManifest
    if (!parsed.ok || parsed.systemId !== systemId) return
    if (parsed.serverConnection?.loginUrl?.trim() === trimmed) return
    parsed.serverConnection = { ...parsed.serverConnection, loginUrl: trimmed }
    await fs.writeFile(manifestPath, JSON.stringify(parsed, null, 2), 'utf8')
  } catch {
    // best-effort
  }
}

function enrichManifestStatus(status: RuntimeStateSnapshot): RuntimeStateSnapshot {
  const port = status.port ?? 8080
  const rawUrl = status.loginUrl ?? status.lanAccessUrl
  const sanitized =
    (rawUrl ? sanitizePublicLoginUrl(rawUrl, port) : null) ??
    buildLanAccessUrl(port, '/login')
  return {
    ...status,
    runtimeKind: MANIFEST_LAN_RUNTIME_KIND,
    port,
    loginUrl: sanitized,
    lanAccessUrl: sanitized,
  }
}

async function loadManifestContext(systemId: string, manifest: InstallationManifest) {
  const rootDirectory = manifest.projectDirectory
  const loaded = await loadServerManifest(rootDirectory)
  const platform = detectManifestPlatform()
  if (!platform) {
    return { error: 'Plataforma não suportada para runtime manifest (use Windows ou Linux).' as const }
  }
  if (!loaded.found || !loaded.ok) {
    return { error: 'server-manifest.json não encontrado ou inválido no clone instalado.' as const }
  }
  return { rootDirectory, loaded, platform }
}

async function buildObservedStatus(
  systemId: string,
  manifest: InstallationManifest,
  persisted: RuntimeStateSnapshot | null,
): Promise<RuntimeStateSnapshot> {
  const ctx = await loadManifestContext(systemId, manifest)
  if ('error' in ctx) {
    return enrichManifestStatus({
      systemId,
      state: 'erro',
      pid: null,
      startedAt: persisted?.startedAt ?? null,
      stoppedAt: persisted?.stoppedAt ?? null,
      uptimeSeconds: null,
      port: resolveHttpPort(manifest, null),
      workingDirectory: manifest.projectDirectory,
      startCommand: MANIFEST_LAN_START_LABEL,
      lastError: ctx.error,
      updatedAt: nowIso(),
    })
  }

  const stateFile = await readServerManifestState(systemId)
  const httpPort = resolveHttpPort(manifest, stateFile)
  const caddyUp = await isLanHttpUp(httpPort)
  const supabaseUp = await supabaseIsRunning(ctx.rootDirectory)
  const { loginUrl, lanAccessUrl } = await resolveLoginUrl({
    systemId,
    manifest,
    rootDirectory: ctx.rootDirectory,
    httpPort,
    serverManifest: ctx.loaded,
  })

  let state = persisted?.state ?? 'instalado'
  let lastError = persisted?.lastError ?? null
  let startedAt = persisted?.startedAt ?? null
  let stoppedAt = persisted?.stoppedAt ?? null

  if (caddyUp) {
    state = 'executando'
    lastError = null
    if (!startedAt) startedAt = persisted?.updatedAt ?? nowIso()
  } else if (state === 'executando' || state === 'iniciando') {
    state = supabaseUp ? 'parado' : 'parado'
    stoppedAt = stoppedAt ?? nowIso()
    startedAt = null
    if (!lastError) {
      lastError = 'Proxy HTTP (Caddy) não está respondendo na porta configurada.'
    }
  } else if (state === 'encerrando') {
    state = 'parado'
    stoppedAt = stoppedAt ?? nowIso()
    startedAt = null
  }

  const snapshot: RuntimeStateSnapshot = {
    systemId,
    state,
    pid: null,
    startedAt,
    stoppedAt,
    uptimeSeconds: computeUptimeSeconds(startedAt),
    port: httpPort,
    workingDirectory: ctx.rootDirectory,
    startCommand: MANIFEST_LAN_START_LABEL,
    lastError,
    updatedAt: nowIso(),
    loginUrl,
    lanAccessUrl,
    supabaseRunning: supabaseUp,
    caddyRunning: caddyUp,
  }

  await writeRuntimeState(snapshot)
  return enrichManifestStatus(snapshot)
}

export async function isManifestLanSystem(systemId: string, manifest: InstallationManifest): Promise<boolean> {
  if (!isManifestLanInstallation(manifest)) return false
  try {
    await fs.access(manifest.projectDirectory)
  } catch {
    return false
  }
  return true
}

export async function getManifestLanRuntimeStatus(
  systemId: string,
  manifest: InstallationManifest,
): Promise<RuntimeActionResponse> {
  const persisted = await readRuntimeState(systemId)
  const status = await buildObservedStatus(systemId, manifest, persisted)
  return { ok: true, status }
}

export async function startManifestLanStack(
  systemId: string,
  manifest: InstallationManifest,
): Promise<RuntimeActionResponse> {
  if (manifestStartLocks.has(systemId)) {
    return { ok: false, message: 'Inicialização já em andamento.' }
  }

  manifestStartLocks.add(systemId)
  try {
    const ctx = await loadManifestContext(systemId, manifest)
    if ('error' in ctx) {
      return { ok: false, message: ctx.error }
    }

    const stateFile = await readServerManifestState(systemId)
    let httpPort = resolveHttpPort(manifest, stateFile)

    const portGuard = await ensureLanHttpPortForSystem({
      systemId,
      rootDirectory: ctx.rootDirectory,
      manifest: ctx.loaded.manifest,
      preferredPort: httpPort,
    })
    if (!portGuard.ok) {
      if (portGuard.conflict) {
        return {
          ok: false,
          message: portGuard.message,
          code: FIXED_LAN_HTTP_PORT_CONFLICT_CODE,
          fixedLanPort8080Conflict: toFixedLanPort8080ConflictApiSnapshot(portGuard.conflict),
        }
      }
      return { ok: false, message: portGuard.message }
    }
    httpPort = portGuard.httpPort

    let fixedLanPolicy = await loadActiveServidorOmpsFixedLanPolicy()
    if (fixedLanPolicy?.fixed.lanHostMode === 'auto') {
      const envRefresh = await prepareServidorEnv({
        rootDirectory: ctx.rootDirectory,
        manifest: ctx.loaded.manifest,
        lanHost: 'auto',
        httpPort,
        accessMode: 'lan',
      })
      if (!envRefresh.ok) {
        return { ok: false, message: envRefresh.message }
      }
      fixedLanPolicy = await loadActiveServidorOmpsFixedLanPolicy()
      if (!fixedLanPolicy) {
        return {
          ok: false,
          message: 'Servidor OMPS: não foi possível determinar o IPv4 LAN após atualizar servidor.env.',
        }
      }
    }

    const portCheck = await lanBuildHttpPortMismatch(ctx.rootDirectory, ctx.loaded.manifest)
    if (portGuard.changed || portCheck.mismatch) {
      const regen = await regenerateLanHttpPortConsumers({
        systemId: ctx.systemId,
        rootDirectory: ctx.rootDirectory,
        manifest: ctx.loaded.manifest,
        platform: ctx.platform,
        includeFrontendBuild: true,
        phaseIdForLog: 'runtime.start',
      })
      if (!regen.ok) {
        const failed: RuntimeStateSnapshot = {
          systemId,
          state: 'erro',
          pid: null,
          startedAt: null,
          stoppedAt: null,
          uptimeSeconds: null,
          port: httpPort,
          workingDirectory: ctx.rootDirectory,
          startCommand: MANIFEST_LAN_START_LABEL,
          lastError: regen.message,
          updatedAt: nowIso(),
        }
        await writeRuntimeState(failed)
        return { ok: false, message: regen.message, status: enrichManifestStatus(failed) }
      }
    }

    if (await isLanHttpUp(httpPort)) {
      if (!fixedLanPolicy) {
        fixedLanPolicy = await loadActiveServidorOmpsFixedLanPolicy()
      }
      if (fixedLanPolicy?.fixed.lanHostMode === 'auto') {
        const envRefresh = await prepareServidorEnv({
          rootDirectory: ctx.rootDirectory,
          manifest: ctx.loaded.manifest,
          lanHost: 'auto',
          httpPort,
          accessMode: 'lan',
        })
        if (envRefresh.ok) {
          fixedLanPolicy = await loadActiveServidorOmpsFixedLanPolicy()
        }
      }
      if (fixedLanPolicy) {
        await startOmpsLanDiscoveryForSystem({
          systemId,
          policy: fixedLanPolicy,
          httpPort,
        })
      }
      const status = await buildObservedStatus(systemId, manifest, await readRuntimeState(systemId))
      return { ok: false, message: 'Stack LAN já está em execução (Caddy respondendo).', status }
    }

    const starting: RuntimeStateSnapshot = {
      systemId,
      state: 'iniciando',
      pid: null,
      startedAt: null,
      stoppedAt: null,
      uptimeSeconds: null,
      port: httpPort,
      workingDirectory: ctx.rootDirectory,
      startCommand: MANIFEST_LAN_START_LABEL,
      lastError: null,
      updatedAt: nowIso(),
    }
    await writeRuntimeState(starting)

    const supabase = await supabaseEnsureStarted(ctx.rootDirectory, { systemId: ctx.systemId })
    if (!supabase.ok) {
      const failed: RuntimeStateSnapshot = {
        ...starting,
        state: 'erro',
        lastError: `Supabase: ${supabase.output.slice(0, 500)}`,
        updatedAt: nowIso(),
      }
      await writeRuntimeState(failed)
      return { ok: false, message: failed.lastError, status: enrichManifestStatus(failed) }
    }

    const startScript = resolveProxyStartScript(ctx.loaded.manifest, ctx.platform)
    if (!startScript) {
      const failed: RuntimeStateSnapshot = {
        ...starting,
        state: 'erro',
        lastError: 'Fase proxy.start / script de início Caddy não encontrado no server-manifest.',
        updatedAt: nowIso(),
      }
      await writeRuntimeState(failed)
      return { ok: false, message: failed.lastError, status: enrichManifestStatus(failed) }
    }

    const proxyResult = await runProxyStartWithPortRecovery(
      {
        systemId: ctx.systemId,
        rootDirectory: ctx.rootDirectory,
        manifest: ctx.loaded.manifest,
        platform: ctx.platform,
        startScript,
        phaseIdForLog: 'runtime.start',
      },
      httpPort,
    )
    httpPort = proxyResult.httpPort

    if (!proxyResult.ok) {
      const failed: RuntimeStateSnapshot = {
        ...starting,
        state: 'erro',
        port: httpPort,
        lastError: proxyResult.message.slice(0, 500),
        updatedAt: nowIso(),
      }
      await writeRuntimeState(failed)
      return { ok: false, message: failed.lastError, status: enrichManifestStatus(failed) }
    }

    const portReady = await waitForLanHttp(httpPort, true)
    if (!portReady) {
      const failed: RuntimeStateSnapshot = {
        ...starting,
        state: 'erro',
        lastError: `Caddy não respondeu em http://127.0.0.1:${httpPort} após ${PORT_PROBE_MAX_MS / 1000}s.`,
        updatedAt: nowIso(),
      }
      await writeRuntimeState(failed)
      return { ok: false, message: failed.lastError, status: enrichManifestStatus(failed) }
    }

    await writeOmpsSystemHttpPort(systemId, httpPort)
    if (!fixedLanPolicy) {
      fixedLanPolicy = await loadActiveServidorOmpsFixedLanPolicy()
    }
    const readiness = await verifyManifestLanReadiness(httpPort, probeLocalHttpUrl, {
      fixedLan: fixedLanPolicy?.fixed,
      resolvedLanHost: fixedLanPolicy?.resolvedHost,
    })
    if (!readiness.ok) {
      const failed: RuntimeStateSnapshot = {
        ...starting,
        state: 'erro',
        port: httpPort,
        lastError: readiness.message.slice(0, 500),
        updatedAt: nowIso(),
      }
      await writeRuntimeState(failed)
      return { ok: false, message: readiness.message, status: enrichManifestStatus(failed) }
    }

    if (fixedLanPolicy) {
      const discovery = await startOmpsLanDiscoveryForSystem({
        systemId,
        policy: fixedLanPolicy,
        httpPort,
      })
      if (!discovery.ok) {
        const failed: RuntimeStateSnapshot = {
          ...starting,
          state: 'erro',
          port: httpPort,
          lastError: discovery.message.slice(0, 500),
          updatedAt: nowIso(),
        }
        await writeRuntimeState(failed)
        return { ok: false, message: discovery.message, status: enrichManifestStatus(failed) }
      }
    }

    const running = await buildObservedStatus(systemId, manifest, {
      ...starting,
      state: 'executando',
      startedAt: nowIso(),
    })
    return { ok: true, status: running }
  } finally {
    manifestStartLocks.delete(systemId)
  }
}

export async function stopManifestLanStack(
  systemId: string,
  manifest: InstallationManifest,
): Promise<RuntimeActionResponse> {
  await stopOmpsLanDiscoveryForSystem(systemId)
  const ctx = await loadManifestContext(systemId, manifest)
  if ('error' in ctx) {
    return { ok: false, message: ctx.error }
  }

  const stateFile = await readServerManifestState(systemId)
  const httpPort = resolveHttpPort(manifest, stateFile)
  const persisted = await readRuntimeState(systemId)

  const stopping: RuntimeStateSnapshot = {
    ...(persisted ?? {
      systemId,
      state: 'encerrando',
      pid: null,
      startedAt: null,
      stoppedAt: null,
      uptimeSeconds: null,
      port: httpPort,
      workingDirectory: ctx.rootDirectory,
      startCommand: MANIFEST_LAN_START_LABEL,
      lastError: null,
      updatedAt: nowIso(),
    }),
    state: 'encerrando',
    updatedAt: nowIso(),
  }
  await writeRuntimeState(stopping)

  const caddyUp = await isLanHttpUp(httpPort)
  if (!caddyUp) {
    const idle = await buildObservedStatus(systemId, manifest, {
      ...stopping,
      state: 'parado',
      startedAt: null,
      stoppedAt: nowIso(),
      lastError: null,
    })
    return { ok: true, status: idle }
  }

  const stopScript = resolveProxyStopScript(ctx.loaded.manifest)
  if (!stopScript) {
    const failed: RuntimeStateSnapshot = {
      ...stopping,
      state: 'erro',
      lastError: 'Script stop-server-lan-sh não encontrado no server-manifest.',
      updatedAt: nowIso(),
    }
    await writeRuntimeState(failed)
    return { ok: false, message: failed.lastError, status: enrichManifestStatus(failed) }
  }

  const env = await loadServidorEnvIntoProcessEnv(ctx.rootDirectory, ctx.loaded.manifest)
  const run = await runManifestScript({
    rootDirectory: ctx.rootDirectory,
    script: stopScript,
    env,
    timeoutMs: SCRIPT_TIMEOUT_MS,
  })

  if (!run.ok) {
    const failed: RuntimeStateSnapshot = {
      ...stopping,
      state: 'erro',
      lastError: `${stopScript.id} falhou: ${run.output.slice(0, 500)}`,
      updatedAt: nowIso(),
    }
    await writeRuntimeState(failed)
    return { ok: false, message: failed.lastError, status: enrichManifestStatus(failed) }
  }

  await waitForLanHttp(httpPort, false)

  const stopped = await buildObservedStatus(systemId, manifest, {
    ...stopping,
    state: 'parado',
    startedAt: null,
    stoppedAt: nowIso(),
    lastError: null,
  })
  return { ok: true, status: stopped }
}

export async function restartManifestLanStack(
  systemId: string,
  manifest: InstallationManifest,
): Promise<RuntimeActionResponse> {
  const stopResult = await stopManifestLanStack(systemId, manifest)
  if (!stopResult.ok && stopResult.status?.state === 'executando') {
    return stopResult
  }
  return startManifestLanStack(systemId, manifest)
}
