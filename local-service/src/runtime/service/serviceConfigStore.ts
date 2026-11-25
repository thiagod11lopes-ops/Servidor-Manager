import fs from 'node:fs/promises'
import path from 'node:path'
import { getProjectDirectory, getSystemRoot } from '../../installation/paths.ts'
import type { ServiceConfigSnapshot, ServiceStartupMode } from './types.ts'
import { deriveWindowsServiceName } from './serviceNames.ts'
import { getServiceHostScriptPath } from '../platform/windows/serviceHostPath.ts'

export function getServiceConfigPath(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'service-config.json')
}

export async function readServiceConfig(systemId: string): Promise<ServiceConfigSnapshot | null> {
  try {
    const raw = await fs.readFile(getServiceConfigPath(systemId), 'utf8')
    return JSON.parse(raw) as ServiceConfigSnapshot
  } catch {
    return null
  }
}

export async function writeServiceConfig(config: ServiceConfigSnapshot): Promise<void> {
  await fs.mkdir(getSystemRoot(config.systemId), { recursive: true })
  await fs.writeFile(getServiceConfigPath(config.systemId), JSON.stringify(config, null, 2), 'utf8')
}

export function buildDefaultServiceConfig(
  systemId: string,
  startupMode: ServiceStartupMode = 'manual',
): ServiceConfigSnapshot {
  return {
    systemId,
    serviceName: deriveWindowsServiceName(systemId),
    installed: false,
    startupMode,
    installedPath: getProjectDirectory(systemId),
    hostScriptPath: getServiceHostScriptPath(),
    installedAt: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  }
}
