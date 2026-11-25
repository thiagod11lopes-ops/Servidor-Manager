import type { SystemRuntimeStatus } from './systemRuntime.ts'
import type { FixedLanPort8080ConflictSnapshot } from './fixedLanPort8080.ts'

export type ServerHealth = 'operational' | 'degraded' | 'offline'

export type ServerStatus = {
  health: ServerHealth
  label: string
  detail: string
}

export type ServerInfoSource = 'local-service' | 'mock'

export type ServerInfo = {
  source: ServerInfoSource
  operatingSystem: string
  computerName: string
  cpuCount: number
  memoryTotalBytes: number
  memoryFreeBytes: number
  memoryTotalLabel: string
  memoryFreeLabel: string
  storagePath: string
  storageTotalBytes: number
  storageAvailableBytes: number
  storageTotalLabel: string
  storageAvailableLabel: string
}

export type CpuMetrics = {
  displayValue: string
  usagePercent?: number
  detail: string
}

export type MemoryMetrics = {
  usagePercent: number
  detail: string
}

export type StorageMetrics = {
  usagePercent: number
  usedLabel: string
  totalLabel: string
  detail: string
}

export type NetworkInfo = {
  localIp: string
  httpPort: number
  httpsPort: number
  externalAccessEnabled: boolean
  detail: string
}

export type SystemLifecycleResult = {
  ok: boolean
  message: string
  status?: SystemRuntimeStatus
  code?: 'FIXED_LAN_HTTP_PORT_CONFLICT'
  fixedLanPort8080Conflict?: FixedLanPort8080ConflictSnapshot
}

export type SystemsRuntimeSummary = {
  installed: number
  running: number
  stopped: number
  error: number
}

/** Inventário de instalações no disco (`systems-runtime-summary`), sem localStorage. */
export type ServerInstalledInventory =
  | { confirmed: true; summary: SystemsRuntimeSummary }
  | { confirmed: false; message: string }
