import type { InstallationDuplicateConflict } from '../types/installationDuplicate.ts'
import {
  isLikelyInstallationDuplicateMessage,
  parseInstallationDuplicateConflict,
} from './installationDuplicateConflict.ts'

export type BundledOmpsInstallFailureKind = 'duplicate_modal' | 'duplicate_incomplete_modal' | 'page_message'

export type BundledOmpsInstallFailureHandling =
  | {
      kind: 'duplicate_modal'
      conflict: InstallationDuplicateConflict
    }
  | {
      kind: 'duplicate_incomplete_modal'
      message: string
      detail: string
    }
  | {
      kind: 'page_message'
      message: string
    }

const INCOMPLETE_DUPLICATE_DETAIL =
  'A duplicidade foi detectada, mas o serviço local não enviou os dados completos da instalação existente (identificador e opções). Use Cancelar e tente de novo; se persistir, reinicie o Manager pelo atalho.'

export function resolveDuplicateFromServicePayload(
  payload: unknown,
): InstallationDuplicateConflict | null {
  return parseInstallationDuplicateConflict(payload)
}

export function handlingForDuplicateMessage(
  message: string,
  resolvedConflict: InstallationDuplicateConflict | null,
): BundledOmpsInstallFailureHandling {
  if (resolvedConflict) {
    return { kind: 'duplicate_modal', conflict: resolvedConflict }
  }
  if (isLikelyInstallationDuplicateMessage(message)) {
    return {
      kind: 'duplicate_incomplete_modal',
      message,
      detail: INCOMPLETE_DUPLICATE_DETAIL,
    }
  }
  return { kind: 'page_message', message }
}

export function handlingFromInstallFailure(
  response: unknown,
  resolvedConflict: InstallationDuplicateConflict | null,
): BundledOmpsInstallFailureHandling | null {
  if (!response || typeof response !== 'object') return null
  const item = response as Record<string, unknown>
  if (item.ok !== false) return null

  const fromBody = parseInstallationDuplicateConflict(response)
  if (fromBody) {
    return { kind: 'duplicate_modal', conflict: fromBody }
  }

  const message = typeof item.message === 'string' ? item.message : null
  if (!message) return null

  return handlingForDuplicateMessage(message, resolvedConflict)
}

/** Evita `omps-setup-message` quando a duplicidade deve ir para o modal. */
export function shouldRenderOmpsSetupPageMessage(
  message: string | null,
  duplicateModalOpen: boolean,
): boolean {
  if (!message || duplicateModalOpen) return false
  return !isLikelyInstallationDuplicateMessage(message)
}
