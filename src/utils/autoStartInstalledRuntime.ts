import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'

/** Estados em que o botão Iniciar estaria habilitado no cartão do sistema. */
export function shouldAutoStartInstalledRuntime(
  status: SystemRuntimeStatus | null | undefined,
): boolean {
  if (!status) return true
  if (status.state === 'executando' || status.state === 'iniciando' || status.state === 'encerrando') {
    return false
  }
  return true
}
