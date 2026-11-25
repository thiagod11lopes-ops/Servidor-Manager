import type { RuntimeStateSnapshot, SystemRemoteAccess } from './types.ts'

/** Validação remota VPN foi removida; candidatos externos não são mais gerados. */
export function composeSystemRemoteAccess(_status: RuntimeStateSnapshot): SystemRemoteAccess | null {
  return null
}
