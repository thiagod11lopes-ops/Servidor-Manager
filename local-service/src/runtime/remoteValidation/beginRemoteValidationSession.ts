import { hashRemoteCandidateUrl } from './candidateUrlHash.ts'
import { clearOperationalExternalProbeReport } from './operationalReportStore.ts'
import { createRemoteValidationSession, invalidateSessionsWithStaleCandidate } from './sessionStore.ts'
import { recomputeCurrentRemoteAccess } from './recomputeRemoteAccess.ts'
import type { RemoteValidationSessionCreated } from './types.ts'
import type { RuntimeStateSnapshot } from '../types.ts'

export type BeginRemoteValidationSessionResult =
  | { ok: true; session: RemoteValidationSessionCreated }
  | { ok: false; reason: 'NO_ACTIVE_CANDIDATE' }

export function beginRemoteValidationSession(
  status: RuntimeStateSnapshot,
  options?: { nowMs?: number; ttlMs?: number },
): BeginRemoteValidationSessionResult {
  const remoteAccess = recomputeCurrentRemoteAccess(status)
  if (!remoteAccess) {
    return { ok: false, reason: 'NO_ACTIVE_CANDIDATE' }
  }

  const candidateUrlHash = hashRemoteCandidateUrl(remoteAccess.candidateUrl)
  invalidateSessionsWithStaleCandidate(status.systemId, candidateUrlHash)
  clearOperationalExternalProbeReport(status.systemId)
  const session = createRemoteValidationSession({
    systemId: status.systemId,
    candidateUrl: remoteAccess.candidateUrl,
    candidateUrlHash,
    nowMs: options?.nowMs,
    ttlMs: options?.ttlMs,
  })

  return { ok: true, session }
}
