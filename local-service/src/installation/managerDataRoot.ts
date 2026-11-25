import os from 'node:os'
import path from 'node:path'

/**
 * Raiz de dados do Manager (systems, config, staging, etc.).
 * Override: SERVIDOR_MANAGER_DATA_ROOT
 */
export function getManagerDataRoot(): string {
  const fromEnv = process.env.SERVIDOR_MANAGER_DATA_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  if (process.platform === 'win32') {
    return path.join('C:\\ServidorManager')
  }
  return path.join(os.homedir(), 'ServidorManager')
}

export function getManagerConfigDir(): string {
  const fromEnv = process.env.SERVIDOR_MANAGER_CONFIG_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(getManagerDataRoot(), 'config')
}

export function getManagerLogsDir(): string {
  return path.join(getManagerDataRoot(), 'logs')
}

export function getManagerMonitoringRoot(): string {
  return path.join(getManagerDataRoot(), 'monitoring')
}

export function getBrowserUploadStagingRoot(): string {
  return path.join(getManagerDataRoot(), 'staging', 'browser-upload')
}
