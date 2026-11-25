import type { RemoteValidationState } from '../types/remoteValidation.ts'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'

export function remoteValidationStateLabel(_state: RemoteValidationState): string {
  return 'Não aplicável'
}

export type RemoteValidationDisplay = {
  state: RemoteValidationState
  summary: string
}

/** Validação remota VPN foi removida — apenas Local e LAN. */
export function resolveRemoteValidationDisplay(_status: SystemRuntimeStatus): RemoteValidationDisplay {
  return {
    state: 'not_applicable',
    summary: 'Use o endereço LAN (IPv4 Wi‑Fi/Ethernet) para aceder a partir de outros dispositivos na mesma rede.',
  }
}
