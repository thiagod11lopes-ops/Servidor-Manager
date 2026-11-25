import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getRuntimeNodeExecutablePath } from './serviceHostPath.ts'
import type { ServiceHostPlatform } from '../serviceHost.ts'

const execFileAsync = promisify(execFile)

export type WindowsServiceQueryState = 'running' | 'stopped' | 'not_installed' | 'unknown'

function mapScError(error: unknown): string {
  const err = error as { code?: number; message?: string; stderr?: string }
  const text = `${err.stderr ?? ''} ${err.message ?? ''}`.toLowerCase()
  if (err.code === 5 || text.includes('access is denied')) return 'ADMIN_REQUIRED'
  if (text.includes('requires elevation')) return 'ADMIN_REQUIRED'
  return 'SC_FAILED'
}

export async function queryWindowsService(serviceName: string): Promise<{
  state: WindowsServiceQueryState
  rawState: string | null
}> {
  try {
    const { stdout } = await execFileAsync('sc', ['query', serviceName], {
      windowsHide: true,
      timeout: 15_000,
    })
    const upper = stdout.toUpperCase()
    if (upper.includes('RUNNING')) return { state: 'running', rawState: 'RUNNING' }
    if (upper.includes('STOPPED')) return { state: 'stopped', rawState: 'STOPPED' }
    if (upper.includes('START_PENDING')) return { state: 'running', rawState: 'START_PENDING' }
    if (upper.includes('STOP_PENDING')) return { state: 'stopped', rawState: 'STOP_PENDING' }
    return { state: 'unknown', rawState: stdout.trim() }
  } catch (error) {
    const err = error as { stderr?: string; message?: string }
    const text = `${err.stderr ?? ''} ${err.message ?? ''}`.toUpperCase()
    if (text.includes('1060') || text.includes('DOES NOT EXIST')) {
      return { state: 'not_installed', rawState: null }
    }
    return { state: 'unknown', rawState: text.slice(0, 200) }
  }
}

export async function installWindowsService(input: {
  serviceName: string
  binPath: string
  displayName: string
  automaticStartup: boolean
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const startMode = input.automaticStartup ? 'auto' : 'demand'
  try {
    await execFileAsync(
      'sc',
      [
        'create',
        input.serviceName,
        `binPath= ${input.binPath}`,
        `start= ${startMode}`,
        `DisplayName= ${input.displayName}`,
      ],
      { windowsHide: true, timeout: 30_000 },
    )
    return { ok: true }
  } catch (error) {
    return { ok: false, code: mapScError(error) }
  }
}

export async function uninstallWindowsService(serviceName: string): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    await execFileAsync('sc', ['delete', serviceName], { windowsHide: true, timeout: 30_000 })
    return { ok: true }
  } catch (error) {
    return { ok: false, code: mapScError(error) }
  }
}

export async function startWindowsService(serviceName: string): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    await execFileAsync('sc', ['start', serviceName], { windowsHide: true, timeout: 60_000 })
    return { ok: true }
  } catch (error) {
    return { ok: false, code: mapScError(error) }
  }
}

export async function stopWindowsService(serviceName: string): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    await execFileAsync('sc', ['stop', serviceName], { windowsHide: true, timeout: 60_000 })
    return { ok: true }
  } catch (error) {
    return { ok: false, code: mapScError(error) }
  }
}

export async function setWindowsServiceStartup(
  serviceName: string,
  automatic: boolean,
): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    await execFileAsync(
      'sc',
      ['config', serviceName, `start=${automatic ? 'auto' : 'demand'}`],
      { windowsHide: true, timeout: 20_000 },
    )
    return { ok: true }
  } catch (error) {
    return { ok: false, code: mapScError(error) }
  }
}

export const windowsServiceHostPlatform: ServiceHostPlatform = {
  buildServiceBinPath(systemId, hostScriptPath) {
    const nodePath = getRuntimeNodeExecutablePath()
    return `"${nodePath}" "${hostScriptPath}" --system-id=${systemId}`
  },
}
