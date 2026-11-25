import { composeSystemRemoteAccess } from '../composeSystemRemoteAccess.ts'
import type { RuntimeStateSnapshot, SystemRemoteAccess } from '../types.ts'

export function recomputeCurrentRemoteAccess(status: RuntimeStateSnapshot): SystemRemoteAccess | null {
  return composeSystemRemoteAccess(status)
}
