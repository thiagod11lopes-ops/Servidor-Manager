export const RUNTIME_CHANGED_EVENT = 'servidor-manager:runtime-changed'

export function notifyRuntimeChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(RUNTIME_CHANGED_EVENT))
}
