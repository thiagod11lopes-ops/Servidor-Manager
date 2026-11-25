import type { ManagedInstallationRecord } from './enumerateManagedInstallations.ts'
import { managedInstallationLifecycleLabel } from './enumerateManagedInstallations.ts'

export type InstallationSourceKeyProvenance =
  | 'manifest'
  | 'server_manifest_state'
  | 'docker_pause'
  | 'first_run'
  | 'system_fallback'

export type SourcedInstallationKey = {
  key: string
  provenance: InstallationSourceKeyProvenance
}

export type InstallationOriginMatchTier = 'proven' | 'probable' | 'different' | 'indeterminate'

export type RankedInstallationOriginMatch = {
  record: ManagedInstallationRecord
  tier: InstallationOriginMatchTier
}

const AUTHORITATIVE_PROVENANCE = new Set<InstallationSourceKeyProvenance>([
  'manifest',
  'server_manifest_state',
  'docker_pause',
])

function overlappingKeys(
  record: ManagedInstallationRecord,
  targetKeys: string[],
): SourcedInstallationKey[] {
  const target = new Set(targetKeys)
  const sourced = record.sourcedKeys ?? []
  if (sourced.length > 0) {
    return sourced.filter((item) => target.has(item.key))
  }
  return record.sourceKeys
    .filter((key) => target.has(key))
    .map((key) => ({
      key,
      provenance: key.startsWith('system:') ? ('system_fallback' as const) : ('first_run' as const),
    }))
}

/** Classifica relação entre um registro gerenciado e as chaves de origem alvo. */
export function classifyInstallationOriginMatch(
  record: ManagedInstallationRecord,
  targetKeys: string[],
): InstallationOriginMatchTier {
  const overlap = overlappingKeys(record, targetKeys)
  if (overlap.length === 0) return 'different'
  if (overlap.every((item) => item.provenance === 'system_fallback')) return 'indeterminate'
  if (overlap.some((item) => AUTHORITATIVE_PROVENANCE.has(item.provenance))) return 'proven'
  if (overlap.some((item) => item.provenance === 'first_run')) return 'probable'
  return 'probable'
}

function lifecycleRank(lifecycle: ManagedInstallationRecord['lifecycle']): number {
  switch (lifecycle) {
    case 'in_progress':
      return 6
    case 'awaiting_docker':
      return 5
    case 'interrupted':
      return 4
    case 'failed':
      return 3
    case 'partial':
      return 2
    case 'completed':
      return 1
    default:
      return 0
  }
}

export function sortRecordsForRecommendation(
  records: ManagedInstallationRecord[],
): ManagedInstallationRecord[] {
  return [...records].sort((a, b) => {
    const byLifecycle = lifecycleRank(b.lifecycle) - lifecycleRank(a.lifecycle)
    if (byLifecycle !== 0) return byLifecycle
    return (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')
  })
}

export function findRankedOriginMatches(input: {
  records: ManagedInstallationRecord[]
  targetKeys: string[]
  excludeSystemId?: string
}): RankedInstallationOriginMatch[] {
  const matches: RankedInstallationOriginMatch[] = []
  for (const record of input.records) {
    if (record.systemId === input.excludeSystemId) continue
    const tier = classifyInstallationOriginMatch(record, input.targetKeys)
    if (tier === 'different') continue
    matches.push({ record, tier })
  }
  return matches
}

export function partitionActionableOriginMatches(matches: RankedInstallationOriginMatch[]): {
  actionable: RankedInstallationOriginMatch[]
  indeterminateOnly: RankedInstallationOriginMatch[]
} {
  const actionable = matches.filter((m) => m.tier === 'proven' || m.tier === 'probable')
  const indeterminateOnly = matches.filter((m) => m.tier === 'indeterminate')
  return { actionable, indeterminateOnly }
}

export function isAmbiguousOriginSelection(
  actionable: RankedInstallationOriginMatch[],
): boolean {
  const proven = actionable.filter((m) => m.tier === 'proven')
  if (proven.length > 1) return true
  if (proven.length === 0 && actionable.length > 1) return true
  return false
}

export function pickRecommendedInstallationRecord(
  actionable: RankedInstallationOriginMatch[],
): ManagedInstallationRecord | null {
  if (actionable.length === 0) return null
  const proven = actionable.filter((m) => m.tier === 'proven')
  const pool = proven.length > 0 ? proven : actionable
  return sortRecordsForRecommendation(pool.map((m) => m.record))[0] ?? null
}

export function recordToDuplicateSummary(record: ManagedInstallationRecord): {
  systemId: string
  systemName: string
  repositoryLabel: string
  lifecycle: ManagedInstallationRecord['lifecycle']
  lifecycleLabel: string
  lastActivityAt: string | null
  manifestStatus: string | null
  installDirectory: string | null
} {
  return {
    systemId: record.systemId,
    systemName: record.systemName,
    repositoryLabel: record.repositoryLabel,
    lifecycle: record.lifecycle,
    lifecycleLabel: managedInstallationLifecycleLabel(record.lifecycle),
    lastActivityAt: record.lastActivityAt,
    manifestStatus: record.manifestStatus,
    installDirectory: record.installDirectory,
  }
}
