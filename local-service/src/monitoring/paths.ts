import path from 'node:path'
import { getManagerMonitoringRoot } from '../installation/managerDataRoot.ts'

export function getMonitoringRoot(): string {
  return getManagerMonitoringRoot()
}

/** @deprecated Prefer getMonitoringRoot() */
export const MONITORING_ROOT = 'C:\\ServidorManager\\monitoring'

export function monitoringFile(name: string): string {
  const root = path.resolve(getMonitoringRoot())
  const target = path.join(root, name)
  const resolved = path.resolve(target)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('INVALID_MONITORING_PATH')
  }
  return resolved
}
