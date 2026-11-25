/**
 * Limitação de confiança (B1): um relatório colado/enviado com sessionToken + nonce
 * pode ser fabricado sem executar o probe. Esta etapa valida apenas vínculo com sessão
 * e candidato vigente recomputado no servidor — não prova execução externa do GET.
 * remoteValidated permanece false até um mecanismo futuro que elimine fabricação trivial.
 */

export type RemoteValidationSessionRecord = {
  sessionId: string
  /** SHA-256 do token; o token em claro só é devolvido na criação. */
  sessionTokenHash: string
  systemId: string
  candidateUrlHash: string
  nonce: string
  createdAt: string
  expiresAt: string
  consumedAt: string | null
}

export type RemoteValidationSessionCreated = {
  sessionId: string
  systemId: string
  sessionToken: string
  nonce: string
  candidateUrlHash: string
  /** URL candidata vigente no momento da sessão (para pacote do agente; não confiar em relatório). */
  probeUrl: string
  expiresAt: string
}

export type RemoteValidationReportInput = {
  systemId: string
  sessionToken: string
  nonce: string
  probeUrlHash: string
  responded: boolean
  httpStatus?: number
  reportedAt?: string
}

export type IngestRemoteValidationReportFailureReason =
  | 'INVALID_REPORT_SHAPE'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'SESSION_ALREADY_USED'
  | 'SYSTEM_MISMATCH'
  | 'NONCE_MISMATCH'
  | 'NO_ACTIVE_CANDIDATE'
  | 'CANDIDATE_MISMATCH'

export type IngestRemoteValidationReportResult =
  | {
      ok: true
      trustLevel: 'session_binding_only'
      systemId: string
      candidateUrlHash: string
      responded: boolean
      httpStatus?: number
    }
  | { ok: false; reason: IngestRemoteValidationReportFailureReason }
