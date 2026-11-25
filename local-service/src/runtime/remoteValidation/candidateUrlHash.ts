import { createHash } from 'node:crypto'

export function hashRemoteCandidateUrl(candidateUrl: string): string {
  const normalized = candidateUrl.trim()
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

export function hashSessionToken(sessionToken: string): string {
  return createHash('sha256').update(sessionToken.trim(), 'utf8').digest('hex')
}
