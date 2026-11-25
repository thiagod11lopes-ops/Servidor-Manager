import { isInstallationActivelyExecuting } from './installationProgressReconciliation.ts'
import {
  enumerateManagedInstallationRecords,
  type ManagedInstallationLifecycle,
  type ManagedInstallationRecord,
} from './enumerateManagedInstallations.ts'
import {
  findRankedOriginMatches,
  isAmbiguousOriginSelection,
  partitionActionableOriginMatches,
  pickRecommendedInstallationRecord,
  recordToDuplicateSummary,
  type InstallationOriginMatchTier,
} from './installationOriginMatch.ts'

export type InstallationDuplicateSummary = {
  systemId: string
  systemName: string
  repositoryLabel: string
  lifecycle: ManagedInstallationLifecycle
  lifecycleLabel: string
  lastActivityAt: string | null
  manifestStatus: string | null
  installDirectory: string | null
}

export type InstallationDuplicateOptions = {
  canResume: boolean
  canReplace: boolean
  canOpen: boolean
  canCancel: true
}

export type InstallationDuplicateConflict = {
  ok: false
  code: 'INSTALLATION_DUPLICATE'
  message: string
  existing: InstallationDuplicateSummary
  options: InstallationDuplicateOptions
  originMatch: InstallationOriginMatchTier
  ambiguous: boolean
  candidates: InstallationDuplicateSummary[]
}

function isActivelyInstalling(systemId: string): boolean {
  return isInstallationActivelyExecuting(systemId)
}

function deriveOptions(record: ManagedInstallationRecord): InstallationDuplicateOptions {
  const activelyRunning =
    record.lifecycle === 'in_progress' && isActivelyInstalling(record.systemId)

  if (record.lifecycle === 'completed') {
    return {
      canResume: false,
      canReplace: !activelyRunning,
      canOpen: true,
      canCancel: true,
    }
  }

  if (record.lifecycle === 'in_progress') {
    if (!activelyRunning) {
      return {
        canResume: true,
        canReplace: true,
        canOpen: false,
        canCancel: true,
      }
    }
    return {
      canResume: false,
      canReplace: false,
      canOpen: false,
      canCancel: true,
    }
  }

  return {
    canResume: true,
    canReplace: !activelyRunning,
    canOpen: false,
    canCancel: true,
  }
}

function safeOptionsWhenAmbiguous(
  candidates: ManagedInstallationRecord[],
): InstallationDuplicateOptions {
  const canOpen = candidates.some((record) => record.lifecycle === 'completed')
  return {
    canResume: false,
    canReplace: false,
    canOpen,
    canCancel: true,
  }
}

function buildMessage(primary: ManagedInstallationRecord, input: {
  ambiguous: boolean
  originMatch: InstallationOriginMatchTier
  candidateCount: number
}): string {
  if (input.originMatch === 'indeterminate') {
    return 'Há pastas de instalação gerenciadas, mas não foi possível confirmar com segurança se correspondem a esta origem. Escolha Cancelar e verifique os identificadores antes de excluir ou retomar.'
  }
  if (input.ambiguous) {
    return `Foram encontradas ${input.candidateCount} instalações associadas a esta origem. Selecione qual identificador deseja retomar ou substituir — nenhuma ação será aplicada automaticamente.`
  }
  if (primary.lifecycle === 'completed') {
    return 'Este servidor já foi instalado neste computador. Abra a instalação existente ou confirme exclusão antes de reinstalar.'
  }
  if (primary.lifecycle === 'in_progress' && isActivelyInstalling(primary.systemId)) {
    return 'Há uma instalação em andamento para a mesma origem. Aguarde a conclusão ou acompanhe o progresso antes de iniciar outra.'
  }
  if (primary.lifecycle === 'awaiting_docker') {
    return 'Há uma instalação pausada aguardando Docker para a mesma origem. Retome a instalação existente em vez de criar outra.'
  }
  return 'Foi encontrada uma instalação anterior incompleta ou com falha para a mesma origem. Retome ou exclua antes de criar outra.'
}

export async function findRankedInstallationOriginMatches(input: {
  sourceKeys: string[]
  excludeSystemId?: string
}) {
  const records = await enumerateManagedInstallationRecords()
  return findRankedOriginMatches({
    records,
    targetKeys: input.sourceKeys,
    excludeSystemId: input.excludeSystemId,
  })
}

export async function findInstallationDuplicateConflict(input: {
  sourceKeys: string[]
  excludeSystemId?: string
}): Promise<InstallationDuplicateConflict | null> {
  if (input.sourceKeys.length === 0) return null

  const ranked = await findRankedInstallationOriginMatches(input)
  if (ranked.length === 0) return null

  const { actionable, indeterminateOnly } = partitionActionableOriginMatches(ranked)

  if (actionable.length === 0) {
    const recommended = indeterminateOnly[0]?.record
    if (!recommended) return null
    const candidates = indeterminateOnly.map((m) => recordToDuplicateSummary(m.record))
    return {
      ok: false,
      code: 'INSTALLATION_DUPLICATE',
      message: buildMessage(recommended, {
        ambiguous: true,
        originMatch: 'indeterminate',
        candidateCount: candidates.length,
      }),
      existing: recordToDuplicateSummary(recommended),
      options: safeOptionsWhenAmbiguous(indeterminateOnly.map((m) => m.record)),
      originMatch: 'indeterminate',
      ambiguous: true,
      candidates,
    }
  }

  const ambiguous = isAmbiguousOriginSelection(actionable)
  const recommended = pickRecommendedInstallationRecord(actionable)
  if (!recommended) return null

  const originMatch: InstallationOriginMatchTier = actionable.some((m) => m.tier === 'proven')
    ? 'proven'
    : 'probable'

  const candidateRecords = actionable.map((m) => m.record)
  const candidates = candidateRecords.map((record) => recordToDuplicateSummary(record))

  const options = ambiguous
    ? safeOptionsWhenAmbiguous(candidateRecords)
    : deriveOptions(recommended)

  return {
    ok: false,
    code: 'INSTALLATION_DUPLICATE',
    message: buildMessage(recommended, {
      ambiguous,
      originMatch,
      candidateCount: candidates.length,
    }),
    existing: recordToDuplicateSummary(recommended),
    options,
    originMatch,
    ambiguous,
    candidates,
  }
}

export async function validateInstallationActionForSourceKeys(input: {
  systemId: string
  action: 'resume' | 'replace'
  sourceKeys: string[]
}): Promise<{ ok: true; record: ManagedInstallationRecord } | InstallationDuplicateConflict> {
  const ranked = await findRankedInstallationOriginMatches({ sourceKeys: input.sourceKeys })
  const match = ranked.find((item) => item.record.systemId === input.systemId)
  if (!match) {
    return {
      ok: false,
      code: 'INSTALLATION_DUPLICATE',
      message:
        'O identificador selecionado não corresponde a nenhuma instalação reconhecida para esta origem. Nenhuma alteração foi feita.',
      existing: {
        systemId: input.systemId,
        systemName: input.systemId,
        repositoryLabel: 'Origem não registrada',
        lifecycle: 'partial',
        lifecycleLabel: 'Instalação incompleta',
        lastActivityAt: null,
        manifestStatus: null,
        installDirectory: null,
      },
      options: { canResume: false, canReplace: false, canOpen: false, canCancel: true },
      originMatch: 'indeterminate',
      ambiguous: true,
      candidates: ranked.map((item) => recordToDuplicateSummary(item.record)),
    }
  }

  if (match.tier === 'indeterminate') {
    return {
      ok: false,
      code: 'INSTALLATION_DUPLICATE',
      message:
        'Não há evidência suficiente para retomar ou substituir esta instalação automaticamente. Verifique o identificador ou cancele.',
      existing: recordToDuplicateSummary(match.record),
      options: { canResume: false, canReplace: false, canOpen: false, canCancel: true },
      originMatch: 'indeterminate',
      ambiguous: true,
      candidates: ranked.map((item) => recordToDuplicateSummary(item.record)),
    }
  }

  if (input.action === 'replace' && isActivelyInstalling(input.systemId)) {
    return {
      ok: false,
      code: 'INSTALLATION_DUPLICATE',
      message:
        'Esta instalação está em execução neste serviço local. Aguarde a conclusão antes de substituí-la.',
      existing: recordToDuplicateSummary(match.record),
      options: { canResume: false, canReplace: false, canOpen: false, canCancel: true },
      originMatch: match.tier,
      ambiguous: false,
      candidates: [recordToDuplicateSummary(match.record)],
    }
  }

  return { ok: true, record: match.record }
}

export function isInstallationDuplicateConflict(
  value: unknown,
): value is InstallationDuplicateConflict {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return item.ok === false && item.code === 'INSTALLATION_DUPLICATE' && typeof item.message === 'string'
}
