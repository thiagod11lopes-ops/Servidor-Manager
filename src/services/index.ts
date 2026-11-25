import { createLocalManagerService } from './createLocalManagerService.ts'

/**
 * Ponto único de acesso da UI ao serviço local.
 * Hoje usa implementação mock; futuramente pode trocar para cliente HTTP/IPC
 * que conversa com o processo do Manager no Windows/Linux.
 */
export const localManagerService = createLocalManagerService()

export type { LocalManagerService } from './localManagerService.ts'
export { createLocalManagerService } from './createLocalManagerService.ts'
