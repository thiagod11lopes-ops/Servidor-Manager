import type { FixedLanPort8080ConflictSnapshot } from '../types/fixedLanPort8080.ts'
import type { SystemLifecycleResult } from '../types/managerService.ts'

export function isFixedLanPort8080LifecycleFailure(
  result: Pick<SystemLifecycleResult, 'ok' | 'message' | 'code'>,
): boolean {
  if (result.code === 'FIXED_LAN_HTTP_PORT_CONFLICT') return true
  if (result.ok) return false
  return /8080|FIXED_LAN_HTTP_PORT_CONFLICT|porta HTTP 8080/i.test(result.message)
}

export function fixedLanPort8080ConflictFromLifecycle(
  result: SystemLifecycleResult,
): FixedLanPort8080ConflictSnapshot | null {
  return result.fixedLanPort8080Conflict ?? null
}
