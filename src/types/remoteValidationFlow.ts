import type { SystemRemoteAccess } from './systemRuntime.ts'

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

export type StartRemoteValidationSessionResponse =
  | {
      ok: true
      package: RemoteValidationAgentPackage
      trustNotice: string
    }
  | { ok: false; reason?: string; message: string }

export type SubmitRemoteValidationReportResponse =
  | {
      ok: true
      ingest: {
        trustLevel: 'session_binding_only'
        responded: boolean
        httpStatus?: number
        acceptedAt: string
      }
      remoteAccess?: SystemRemoteAccess
      remoteValidated: false
    }
  | { ok: false; reason?: string; message: string }
