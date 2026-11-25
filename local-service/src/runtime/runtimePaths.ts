import path from 'node:path'
import { getSystemRoot } from '../installation/paths.ts'

export function getRuntimeStatePath(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'runtime-state.json')
}

export function getLogsDirectory(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'logs')
}

export function getStdoutLogPath(systemId: string): string {
  return path.join(getLogsDirectory(systemId), 'stdout.log')
}

export function getStderrLogPath(systemId: string): string {
  return path.join(getLogsDirectory(systemId), 'stderr.log')
}

export function getServiceLogPath(systemId: string): string {
  return path.join(getLogsDirectory(systemId), 'service.log')
}

export function getApplicationPidPath(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'application.pid')
}
