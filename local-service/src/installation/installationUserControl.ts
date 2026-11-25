/** Controle explícito do usuário: pausar instalação em andamento (entre fases). */

const pauseRequested = new Set<string>()

export const USER_PAUSE_MESSAGE = 'Pausado pelo usuário. Use Analizar para retomar ou Reiniciar para começar de novo.'

export function requestInstallationUserPause(systemId: string): void {
  pauseRequested.add(systemId)
}

export function clearInstallationUserPause(systemId: string): void {
  pauseRequested.delete(systemId)
}

export function isInstallationUserPauseRequested(systemId: string): boolean {
  return pauseRequested.has(systemId)
}

export function consumeInstallationUserPause(systemId: string): boolean {
  if (!pauseRequested.has(systemId)) return false
  pauseRequested.delete(systemId)
  return true
}
