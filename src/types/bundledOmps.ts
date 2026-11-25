export type BundledOmpsStatus =
  | { ok: true; available: false; reason: string }
  | {
      ok: true
      available: true
      verified: true
      displayName: string
      ompsVersion: string
      ompsGitSha: string | null
      sourceRevisionKind: string | null
      payloadFileCount: number
      payloadContentSha256: string
      firstRun: {
        systemId: string
        completed: boolean
        accessMode?: 'local' | 'lan'
      } | null
    }

export function bundledOmpsFirstRunCompleted(status: BundledOmpsStatus | null | undefined): boolean {
  if (!status || status.ok !== true || !status.available) return false
  return status.firstRun?.completed === true
}

import type { InstallationDuplicateConflict } from './installationDuplicate.ts'

export type BundledOmpsInstallResponse =
  | { ok: true; accepted: true; systemId: string; message: string }
  | { ok: false; message: string }
  | { ok: false; paused: true; code: 'DOCKER_AWAITING'; message: string; systemId: string }
  | InstallationDuplicateConflict
