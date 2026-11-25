import { hashRemoteCandidateUrl } from './candidateUrlHash.ts'
import {
  findSessionByToken,
  isSessionExpired,
  markSessionConsumed,
} from './sessionStore.ts'
import { recomputeCurrentRemoteAccess } from './recomputeRemoteAccess.ts'
import type {
  IngestRemoteValidationReportResult,
  RemoteValidationReportInput,
} from './types.ts'
import type { RuntimeStateSnapshot } from '../types.ts'

function validateReportShape(report: RemoteValidationReportInput): boolean {
  if (typeof report.systemId !== 'string' || !report.systemId.trim()) return false
  if (typeof report.sessionToken !== 'string' || !report.sessionToken.trim()) return false
  if (typeof report.nonce !== 'string' || !report.nonce.trim()) return false
  if (typeof report.probeUrlHash !== 'string' || !/^[a-f0-9]{64}$/i.test(report.probeUrlHash.trim())) {
    return false
  }
  if (typeof report.responded !== 'boolean') return false
  if (report.responded) {
    if (typeof report.httpStatus !== 'number' || !Number.isInteger(report.httpStatus)) return false
    if (report.httpStatus < 100 || report.httpStatus > 599) return false
  } else if (report.httpStatus != null) {
    return false
  }
  return true
}

/**
 * Valida vínculo sessão ↔ sistema ↔ candidato recomputado. Não altera remoteValidated.
 * Não atesta que o probe externo ocorreu (relatório pode ser fabricado com o pacote da sessão).
 */
export function ingestRemoteValidationReport(
  report: RemoteValidationReportInput,
  status: RuntimeStateSnapshot,
  options?: { nowMs?: number },
): IngestRemoteValidationReportResult {
  if (!validateReportShape(report)) {
    return { ok: false, reason: 'INVALID_REPORT_SHAPE' }
  }

  const nowMs = options?.nowMs ?? Date.now()
  const session = findSessionByToken(report.sessionToken)
  if (!session) {
    return { ok: false, reason: 'SESSION_NOT_FOUND' }
  }

  if (session.systemId !== report.systemId.trim()) {
    return { ok: false, reason: 'SYSTEM_MISMATCH' }
  }

  if (session.nonce !== report.nonce.trim()) {
    return { ok: false, reason: 'NONCE_MISMATCH' }
  }

  if (isSessionExpired(session, nowMs)) {
    return { ok: false, reason: 'SESSION_EXPIRED' }
  }

  if (session.consumedAt) {
    return { ok: false, reason: 'SESSION_ALREADY_USED' }
  }

  const remoteAccess = recomputeCurrentRemoteAccess(status)
  if (!remoteAccess) {
    return { ok: false, reason: 'NO_ACTIVE_CANDIDATE' }
  }

  const liveHash = hashRemoteCandidateUrl(remoteAccess.candidateUrl)
  if (liveHash !== session.candidateUrlHash || liveHash !== report.probeUrlHash.trim().toLowerCase()) {
    return { ok: false, reason: 'CANDIDATE_MISMATCH' }
  }

  const consumedAt = new Date(nowMs).toISOString()
  if (!markSessionConsumed(session.sessionId, consumedAt)) {
    return { ok: false, reason: 'SESSION_ALREADY_USED' }
  }

  return {
    ok: true,
    trustLevel: 'session_binding_only',
    systemId: session.systemId,
    candidateUrlHash: liveHash,
    responded: report.responded,
    httpStatus: report.responded ? report.httpStatus : undefined,
  }
}
