import type {
  InstallationDuplicateConflict,
  InstallationDuplicateLifecycle,
  InstallationDuplicateOptions,
  InstallationDuplicateSummary,
} from '../types/installationDuplicate.ts'

const DUPLICATE_CODE = 'INSTALLATION_DUPLICATE'

const LIKELY_DUPLICATE_MESSAGE_MARKERS = [
  'instalação anterior incompleta ou com falha',
  'Retome ou exclua antes de criar outra',
  'Já existe uma instalação correspondente',
  'INSTALLATION_DUPLICATE',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

export function isLikelyInstallationDuplicateMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  if (normalized.length === 0) return false
  return LIKELY_DUPLICATE_MESSAGE_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase()),
  )
}

function unwrapDuplicatePayload(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null

  if (value.ok === true && value.duplicate === true && isRecord(value.conflict)) {
    return value.conflict
  }

  if (isRecord(value.conflict)) {
    const nested = value.conflict
    if (nested.code === DUPLICATE_CODE || isRecord(nested.existing)) {
      return nested
    }
  }

  if (isRecord(value.data)) {
    const fromData = unwrapDuplicatePayload(value.data)
    if (fromData) return fromData
  }

  if (isRecord(value.error)) {
    const fromError = unwrapDuplicatePayload(value.error)
    if (fromError) return fromError
  }

  return value
}

function readExistingSummary(value: unknown): InstallationDuplicateSummary | null {
  if (!isRecord(value)) return null
  const direct = parseSummary(value)
  if (direct) return direct

  const nestedKeys = ['existing', 'existingInstallation', 'installation', 'match'] as const
  for (const key of nestedKeys) {
    if (key in value) {
      const parsed = parseSummary(value[key])
      if (parsed) return parsed
    }
  }

  if (typeof value.id === 'string' && value.id.trim().length > 0 && !value.systemId) {
    return parseSummary({ ...value, systemId: value.id })
  }

  return null
}

function readLifecycle(value: unknown): InstallationDuplicateLifecycle {
  const allowed: InstallationDuplicateLifecycle[] = [
    'completed',
    'failed',
    'in_progress',
    'awaiting_docker',
    'interrupted',
    'partial',
  ]
  if (typeof value === 'string' && (allowed as string[]).includes(value)) {
    return value as InstallationDuplicateLifecycle
  }
  return 'partial'
}

function parseSummary(value: unknown): InstallationDuplicateSummary | null {
  if (!isRecord(value)) return null
  if (typeof value.systemId !== 'string' || value.systemId.trim().length === 0) return null
  return {
    systemId: value.systemId.trim(),
    systemName: typeof value.systemName === 'string' ? value.systemName : value.systemId.trim(),
    repositoryLabel:
      typeof value.repositoryLabel === 'string' ? value.repositoryLabel : 'Origem não registrada',
    lifecycle: readLifecycle(value.lifecycle),
    lifecycleLabel:
      typeof value.lifecycleLabel === 'string' ? value.lifecycleLabel : 'Instalação incompleta',
    lastActivityAt: typeof value.lastActivityAt === 'string' ? value.lastActivityAt : null,
    manifestStatus: typeof value.manifestStatus === 'string' ? value.manifestStatus : null,
    installDirectory: typeof value.installDirectory === 'string' ? value.installDirectory : null,
  }
}

/** Inferência quando o backend ou uma versão antiga não envia `options`. */
export function inferInstallationDuplicateOptions(
  lifecycle: InstallationDuplicateLifecycle,
): InstallationDuplicateOptions {
  if (lifecycle === 'completed') {
    return { canResume: false, canReplace: true, canOpen: true, canCancel: true }
  }
  if (lifecycle === 'in_progress') {
    return { canResume: false, canReplace: false, canOpen: false, canCancel: true }
  }
  return { canResume: true, canReplace: true, canOpen: false, canCancel: true }
}

function parseOptions(
  value: unknown,
  lifecycle: InstallationDuplicateLifecycle,
  message: string,
): InstallationDuplicateOptions {
  if (!isRecord(value)) {
    return coerceInstallationDuplicateOptions(inferInstallationDuplicateOptions(lifecycle), lifecycle, message)
  }
  const inferred = inferInstallationDuplicateOptions(lifecycle)
  const parsed: InstallationDuplicateOptions = {
    canResume: value.canResume === true ? true : value.canResume === false ? false : inferred.canResume,
    canReplace: value.canReplace === true ? true : value.canReplace === false ? false : inferred.canReplace,
    canOpen: value.canOpen === true ? true : value.canOpen === false ? false : inferred.canOpen,
    canCancel: true,
  }
  return coerceInstallationDuplicateOptions(parsed, lifecycle, message)
}

/** Corrige respostas parciais que desabilitam ações indevidamente para instalações retomáveis. */
export function coerceInstallationDuplicateOptions(
  options: InstallationDuplicateOptions,
  lifecycle: InstallationDuplicateLifecycle,
  message: string,
): InstallationDuplicateOptions {
  if (duplicateInstallHasPrimaryActions(options)) return options

  const inferred = inferInstallationDuplicateOptions(lifecycle)
  const likelyDuplicate =
    isLikelyInstallationDuplicateMessage(message) ||
    lifecycle === 'failed' ||
    lifecycle === 'interrupted' ||
    lifecycle === 'partial' ||
    lifecycle === 'awaiting_docker'

  if (!likelyDuplicate || lifecycle === 'in_progress') return options

  return {
    canResume: options.canResume || inferred.canResume,
    canReplace: options.canReplace || inferred.canReplace,
    canOpen: options.canOpen || inferred.canOpen,
    canCancel: true,
  }
}

export type DuplicateInstallModalActions = {
  showCancel: boolean
  showResume: boolean
  showReplace: boolean
  showOpenExisting: boolean
  replaceRequiresConfirmation: boolean
}

export function resolveDuplicateOptionsForSystem(
  conflict: InstallationDuplicateConflict,
  systemId: string,
): InstallationDuplicateOptions {
  if (!conflict.ambiguous) return conflict.options
  const candidate =
    conflict.candidates?.find((item) => item.systemId === systemId) ?? conflict.existing
  return coerceInstallationDuplicateOptions(
    inferInstallationDuplicateOptions(candidate.lifecycle),
    candidate.lifecycle,
    conflict.message,
  )
}

export function getDuplicateInstallModalActions(
  conflict: InstallationDuplicateConflict,
  selectedSystemId?: string,
): DuplicateInstallModalActions {
  const options =
    conflict.ambiguous && selectedSystemId
      ? resolveDuplicateOptionsForSystem(conflict, selectedSystemId)
      : conflict.options
  return {
    showCancel: true,
    showResume: options.canResume,
    showReplace: options.canReplace,
    showOpenExisting: options.canOpen,
    replaceRequiresConfirmation: options.canReplace,
  }
}

export function parseInstallationDuplicateConflict(value: unknown): InstallationDuplicateConflict | null {
  const source = unwrapDuplicatePayload(value)
  if (!source) return null

  const existing = readExistingSummary(source)
  const messageCandidate =
    typeof source.message === 'string' && source.message.trim().length > 0 ? source.message.trim() : ''

  if (!existing) return null

  const message =
    messageCandidate.length > 0
      ? messageCandidate
      : 'Já existe uma instalação correspondente a este repositório ou pacote.'

  const options = parseOptions(source.options, existing.lifecycle, message)

  const originMatch =
    typeof source.originMatch === 'string' &&
    (source.originMatch === 'proven' ||
      source.originMatch === 'probable' ||
      source.originMatch === 'indeterminate')
      ? source.originMatch
      : undefined

  const ambiguous = source.ambiguous === true

  let candidates: InstallationDuplicateSummary[] | undefined
  if (Array.isArray(source.candidates)) {
    const parsedCandidates = source.candidates
      .map((item) => parseSummary(item))
      .filter((item): item is InstallationDuplicateSummary => item != null)
    if (parsedCandidates.length > 0) candidates = parsedCandidates
  }

  return {
    ok: false,
    code: DUPLICATE_CODE,
    message,
    existing,
    options,
    originMatch,
    ambiguous,
    candidates,
  }
}

export function isInstallationDuplicateConflict(value: unknown): value is InstallationDuplicateConflict {
  return parseInstallationDuplicateConflict(value) !== null
}

export function duplicateInstallHasPrimaryActions(options: InstallationDuplicateOptions): boolean {
  return options.canResume || options.canReplace || options.canOpen
}

export function duplicateInstallBlockedReason(
  conflict: InstallationDuplicateConflict,
): string | null {
  if (duplicateInstallHasPrimaryActions(conflict.options)) return null
  if (conflict.existing.lifecycle === 'in_progress') {
    return 'Há uma instalação em execução neste serviço local. Aguarde a conclusão ou feche o Manager e tente de novo.'
  }
  return 'Nenhuma ação automática está disponível para esta instalação. Use Cancelar e contate o suporte se precisar.'
}
