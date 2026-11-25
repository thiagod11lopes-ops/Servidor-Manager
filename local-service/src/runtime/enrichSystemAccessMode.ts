import { readSystemAccessModeConfig } from '../config/systemAccessMode.ts'
import type { RuntimeStateSnapshot } from './types.ts'

export function enrichStatusWithAccessMode(status: RuntimeStateSnapshot): RuntimeStateSnapshot {
  const config = readSystemAccessModeConfig(status.systemId)
  return {
    ...status,
    accessMode: config?.mode ?? null,
  }
}
