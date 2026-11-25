import fs from 'node:fs/promises'
import { getSystemsRoot } from '../../installation/paths.ts'
import { assertValidSystemId } from '../../installation/paths.ts'
import { windowsServiceHostPlatform } from '../platform/windows/windowsServiceManager.ts'
import {
  installWindowsService,
  queryWindowsService,
  setWindowsServiceStartup,
  startWindowsService,
  stopWindowsService,
  uninstallWindowsService,
} from '../platform/windows/windowsServiceManager.ts'
import { readInstallationManifest } from '../installationManifest.ts'
import { readRuntimeState, writeRuntimeState } from '../runtimeStateStore.ts'
import type { RuntimeStateSnapshot } from '../types.ts'
import { getApplicationPidPath } from '../runtimePaths.ts'
import {
  buildDefaultServiceConfig,
  readServiceConfig,
  writeServiceConfig,
} from './serviceConfigStore.ts'
import { resolveValidatedRuntimeStart } from './runtimeStartPlan.ts'
import type { ServiceActionResponse, ServiceConfigSnapshot, ServiceStatusSnapshot } from './types.ts'
import { deriveWindowsServiceName } from './serviceNames.ts'

function adminMessage(code: string | undefined): string {
  if (code === 'ADMIN_REQUIRED') {
    return 'Esta operação requer privilégios administrativos. Execute o Servidor Manager como administrador.'
  }
  return 'Não foi possível concluir a operação do serviço Windows.'
}

async function readApplicationPid(systemId: string): Promise<number | null> {
  try {
    const raw = (await fs.readFile(getApplicationPidPath(systemId), 'utf8')).trim()
    const pid = Number(raw)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

export async function buildServiceStatus(systemId: string): Promise<ServiceStatusSnapshot> {
  assertValidSystemId(systemId)
  const config =
    (await readServiceConfig(systemId)) ?? buildDefaultServiceConfig(systemId, 'manual')
  const query = await queryWindowsService(config.serviceName)

  let visualState: ServiceStatusSnapshot['visualState'] = 'not_installed'
  let running = false
  let lastError = config.lastError

  if (config.installed) {
    if (query.state === 'running') {
      visualState = 'running'
      running = true
    } else if (query.state === 'stopped') {
      visualState = 'stopped'
    } else if (query.state === 'not_installed') {
      visualState = 'error'
      lastError = 'Serviço registrado localmente, mas não encontrado no Windows.'
    } else {
      visualState = 'error'
      lastError = lastError ?? 'Estado do serviço não pôde ser confirmado.'
    }
  }

  return {
    systemId,
    serviceName: config.serviceName,
    installed: config.installed,
    running,
    startupMode: config.startupMode,
    visualState,
    installedPath: config.installedPath,
    lastError,
    windowsState: query.rawState,
  }
}

export async function getServiceConfigPublic(systemId: string): Promise<ServiceConfigSnapshot | null> {
  const config = await readServiceConfig(systemId)
  if (!config) return null
  return config
}

export async function installSystemService(
  systemId: string,
  automaticStartup = false,
): Promise<ServiceActionResponse> {
  const validated = await resolveValidatedRuntimeStart(systemId)
  if (!validated.ok) {
    return { ok: false, message: validated.message }
  }

  const existing = await readServiceConfig(systemId)
  if (existing?.installed) {
    const status = await buildServiceStatus(systemId)
    return { ok: true, status, message: 'Serviço já instalado.' }
  }

  const config = buildDefaultServiceConfig(systemId, automaticStartup ? 'automatic' : 'manual')
  const binPath = windowsServiceHostPlatform.buildServiceBinPath(systemId, config.hostScriptPath)
  const displayName = `Servidor Manager ${deriveWindowsServiceName(systemId)}`

  const created = await installWindowsService({
    serviceName: config.serviceName,
    binPath,
    displayName,
    automaticStartup,
  })

  if (!created.ok) {
    config.lastError = adminMessage(created.code)
    await writeServiceConfig(config)
    return {
      ok: false,
      message: config.lastError,
      code: created.code,
      status: await buildServiceStatus(systemId),
    }
  }

  config.installed = true
  config.installedAt = new Date().toISOString()
  config.lastError = null
  config.updatedAt = new Date().toISOString()
  await writeServiceConfig(config)

  const status = await buildServiceStatus(systemId)
  return { ok: true, status, message: 'Serviço instalado.' }
}

export async function uninstallSystemService(systemId: string): Promise<ServiceActionResponse> {
  const config = await readServiceConfig(systemId)
  if (!config?.installed) {
    return { ok: false, message: 'Serviço não está instalado.' }
  }

  await stopWindowsService(config.serviceName).catch(() => undefined)
  const removed = await uninstallWindowsService(config.serviceName)
  if (!removed.ok) {
    return {
      ok: false,
      message: adminMessage(removed.code),
      code: removed.code,
      status: await buildServiceStatus(systemId),
    }
  }

  config.installed = false
  config.installedAt = null
  config.lastError = null
  config.updatedAt = new Date().toISOString()
  await writeServiceConfig(config)
  await fs.rm(getApplicationPidPath(systemId), { force: true })

  return { ok: true, status: await buildServiceStatus(systemId), message: 'Serviço removido.' }
}

export async function startSystemService(systemId: string): Promise<ServiceActionResponse> {
  const config = await readServiceConfig(systemId)
  if (!config?.installed) {
    return { ok: false, message: 'Instale o serviço Windows antes de iniciar.' }
  }

  const started = await startWindowsService(config.serviceName)
  if (!started.ok) {
    config.lastError = adminMessage(started.code)
    await writeServiceConfig(config)
    return {
      ok: false,
      message: 'Não foi possível iniciar o serviço.',
      status: await buildServiceStatus(systemId),
    }
  }

  await reconcileSystemServiceState(systemId)
  return { ok: true, status: await buildServiceStatus(systemId), message: 'Serviço iniciado.' }
}

export async function stopSystemService(systemId: string): Promise<ServiceActionResponse> {
  const config = await readServiceConfig(systemId)
  if (!config?.installed) {
    return { ok: false, message: 'Serviço não está instalado.' }
  }

  const stopped = await stopWindowsService(config.serviceName)
  if (!stopped.ok) {
    return {
      ok: false,
      message: 'Não foi possível parar o serviço.',
      status: await buildServiceStatus(systemId),
    }
  }

  await reconcileSystemServiceState(systemId)
  return { ok: true, status: await buildServiceStatus(systemId), message: 'Serviço parado.' }
}

export async function restartSystemService(systemId: string): Promise<ServiceActionResponse> {
  const stopResult = await stopSystemService(systemId)
  if (!stopResult.ok && stopResult.status?.running) {
    return stopResult
  }
  return startSystemService(systemId)
}

export async function setSystemServiceStartup(
  systemId: string,
  automaticStartup: boolean,
): Promise<ServiceActionResponse> {
  const config = await readServiceConfig(systemId)
  if (!config?.installed) {
    return { ok: false, message: 'Serviço não está instalado.' }
  }

  const updated = await setWindowsServiceStartup(config.serviceName, automaticStartup)
  if (!updated.ok) {
    return {
      ok: false,
      message: adminMessage(updated.code),
      code: updated.code,
      status: await buildServiceStatus(systemId),
    }
  }

  config.startupMode = automaticStartup ? 'automatic' : 'manual'
  config.updatedAt = new Date().toISOString()
  await writeServiceConfig(config)

  return {
    ok: true,
    status: await buildServiceStatus(systemId),
    message: automaticStartup ? 'Inicialização automática ativada.' : 'Inicialização automática desativada.',
  }
}

export async function isWindowsServiceInstalled(systemId: string): Promise<boolean> {
  const config = await readServiceConfig(systemId)
  return Boolean(config?.installed)
}

export async function reconcileSystemServiceState(systemId: string): Promise<void> {
  const config = await readServiceConfig(systemId)
  if (!config?.installed) return

  const query = await queryWindowsService(config.serviceName)
  const runtime = await readRuntimeState(systemId)
  const appPid = await readApplicationPid(systemId)
  const manifest = await readInstallationManifest(systemId)

  const base: RuntimeStateSnapshot = runtime ?? {
    systemId,
    state: 'parado',
    pid: null,
    startedAt: null,
    stoppedAt: null,
    uptimeSeconds: null,
    port: manifest?.runtimePlan?.identifiedPorts?.[0] ?? null,
    workingDirectory: config.installedPath,
    startCommand: manifest?.runtimePlan?.startCommand ?? manifest?.runtimePlan?.devCommand ?? null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  }

  const nextState: RuntimeStateSnapshot = {
    ...base,
    pid: query.state === 'running' ? appPid : null,
    state:
      query.state === 'running'
        ? 'executando'
        : query.state === 'stopped'
          ? 'parado'
          : query.state === 'not_installed'
            ? 'erro'
            : base.state,
    lastError:
      query.state === 'not_installed'
        ? 'Serviço não encontrado no Windows após reinicialização.'
        : base.lastError,
    updatedAt: new Date().toISOString(),
  }

  await writeRuntimeState(nextState)
}

export async function reconcileAllSystemServices(): Promise<void> {
  let entries: string[] = []
  try {
    entries = await fs.readdir(getSystemsRoot())
  } catch {
    return
  }

  for (const entry of entries) {
    try {
      assertValidSystemId(entry)
      await reconcileSystemServiceState(entry)
    } catch {
      // ignore invalid folders
    }
  }
}
