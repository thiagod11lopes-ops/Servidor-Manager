import type { RemoteValidationSessionCreated } from './types.ts'

export type RemoteValidationAgentPackage = {
  kind: 'servidor-manager-remote-validation-package'
  version: 1
  systemId: string
  sessionId: string
  sessionToken: string
  nonce: string
  probeUrl: string
  candidateUrlHash: string
  expiresAt: string
}

export function buildRemoteValidationAgentPackage(
  session: RemoteValidationSessionCreated,
): RemoteValidationAgentPackage {
  return {
    kind: 'servidor-manager-remote-validation-package',
    version: 1,
    systemId: session.systemId,
    sessionId: session.sessionId,
    sessionToken: session.sessionToken,
    nonce: session.nonce,
    probeUrl: session.probeUrl,
    candidateUrlHash: session.candidateUrlHash,
    expiresAt: session.expiresAt,
  }
}
