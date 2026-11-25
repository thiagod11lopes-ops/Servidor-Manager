import { randomBytes, randomUUID } from 'node:crypto'
import { hashSessionToken } from './candidateUrlHash.ts'
import type { RemoteValidationSessionCreated, RemoteValidationSessionRecord } from './types.ts'

const DEFAULT_TTL_MS = 10 * 60 * 1000

/** Sessões em memória — perdidas ao reiniciar o local-service. */
const sessionsById = new Map<string, RemoteValidationSessionRecord>()
const sessionIdByTokenHash = new Map<string, string>()

export type CreateSessionParams = {
  systemId: string
  candidateUrl: string
  candidateUrlHash: string
  nowMs?: number
  ttlMs?: number
}

export function createRemoteValidationSession(
  params: CreateSessionParams,
): RemoteValidationSessionCreated {
  const nowMs = params.nowMs ?? Date.now()
  const ttlMs = params.ttlMs ?? DEFAULT_TTL_MS
  const sessionToken = randomBytes(32).toString('base64url')
  const sessionTokenHash = hashSessionToken(sessionToken)
  const sessionId = randomUUID()
  const nonce = randomBytes(16).toString('hex')
  const createdAt = new Date(nowMs).toISOString()
  const expiresAt = new Date(nowMs + ttlMs).toISOString()

  const record: RemoteValidationSessionRecord = {
    sessionId,
    sessionTokenHash,
    systemId: params.systemId,
    candidateUrlHash: params.candidateUrlHash,
    nonce,
    createdAt,
    expiresAt,
    consumedAt: null,
  }

  sessionsById.set(sessionId, record)
  sessionIdByTokenHash.set(sessionTokenHash, sessionId)

  return {
    sessionId,
    systemId: params.systemId,
    sessionToken,
    nonce,
    candidateUrlHash: params.candidateUrlHash,
    probeUrl: params.candidateUrl.trim(),
    expiresAt,
  }
}

export function findSessionByToken(sessionToken: string): RemoteValidationSessionRecord | null {
  const tokenHash = hashSessionToken(sessionToken)
  const sessionId = sessionIdByTokenHash.get(tokenHash)
  if (!sessionId) return null
  return sessionsById.get(sessionId) ?? null
}

export function markSessionConsumed(sessionId: string, consumedAtIso: string): boolean {
  const record = sessionsById.get(sessionId)
  if (!record || record.consumedAt) return false
  record.consumedAt = consumedAtIso
  sessionsById.set(sessionId, record)
  return true
}

export function isSessionExpired(record: RemoteValidationSessionRecord, nowMs: number): boolean {
  return nowMs >= Date.parse(record.expiresAt)
}

/** Apenas testes — zera o armazenamento volátil. */
export function invalidateSessionsWithStaleCandidate(
  systemId: string,
  currentCandidateUrlHash: string,
): number {
  let removed = 0
  for (const [sessionId, record] of sessionsById.entries()) {
    if (record.systemId !== systemId) continue
    if (record.candidateUrlHash === currentCandidateUrlHash) continue
    sessionsById.delete(sessionId)
    sessionIdByTokenHash.delete(record.sessionTokenHash)
    removed += 1
  }
  return removed
}

export function resetRemoteValidationSessionStoreForTests(): void {
  sessionsById.clear()
  sessionIdByTokenHash.clear()
}

export function getRemoteValidationSessionStoreDocumentation(): string {
  return 'Sessões de validação remota ficam em memória do processo local-service; reiniciar o serviço invalida sessões pendentes.'
}
