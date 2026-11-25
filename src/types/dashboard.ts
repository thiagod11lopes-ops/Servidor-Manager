import type { SystemRuntimeState } from './systemRuntime.ts'

export type DashboardInstalledSystemRow = {
  systemId: string
  label: string
  sourceUrl: string | null
  loginUrl: string | null
  databaseNumber: string | null
  installedAt: string | null
  state: SystemRuntimeState | 'desconhecido'
  stateLabel: string
  lastError: string | null
  isRunning: boolean
}
