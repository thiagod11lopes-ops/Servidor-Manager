import type { ManagedSystem } from './system.ts'
import { encodeLocalFolderSourceUrl } from '../utils/localFolderSource.ts'

export type SystemSourceKind = 'git' | 'localFolder'

export type ProjectSourceInput =
  | { kind: 'git'; sourceUrl: string }
  | { kind: 'localFolder'; localFolderPath: string }

export function projectSourceFromSystem(system: ManagedSystem): ProjectSourceInput {
  if (system.sourceKind === 'localFolder' && system.localFolderPath?.trim()) {
    return { kind: 'localFolder', localFolderPath: system.localFolderPath.trim() }
  }
  return { kind: 'git', sourceUrl: system.url.trim() }
}

export function displaySystemSource(system: ManagedSystem): string {
  const source = projectSourceFromSystem(system)
  if (source.kind === 'localFolder') return source.localFolderPath
  return system.url
}

export function planSourceUrlForSystem(system: ManagedSystem): string {
  const source = projectSourceFromSystem(system)
  if (source.kind === 'localFolder') return encodeLocalFolderSourceUrl(source.localFolderPath)
  return source.sourceUrl
}

export function projectSourceRequestBody(
  source: ProjectSourceInput,
): { sourceUrl: string } | { localFolderPath: string } {
  if (source.kind === 'localFolder') {
    return { localFolderPath: source.localFolderPath }
  }
  return { sourceUrl: source.sourceUrl }
}

export function installRequestFromSource(
  source: ProjectSourceInput,
): { sourceUrl?: string; localFolderPath?: string } {
  if (source.kind === 'localFolder') {
    return { localFolderPath: source.localFolderPath }
  }
  return { sourceUrl: source.sourceUrl }
}
