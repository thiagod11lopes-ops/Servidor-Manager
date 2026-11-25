export type FixedLanPort8080Listener = {
  port: number
  localAddress: string | null
  pid: number | null
  processName: string | null
  executablePath: string | null
  commandLine: string | null
  serviceName: string | null
  identityConfidence: 'confirmed' | 'partial' | 'unknown'
}

export type FixedLanPort8080ReleaseAuthorization = {
  version: 1
  actionToken: string
  port: 8080
  issuedAt: string
  listenerFingerprint: string
  listener: FixedLanPort8080Listener
  impactSummary: string
}

export type FixedLanPort8080ConflictSnapshot = {
  code: 'FIXED_LAN_HTTP_PORT_CONFLICT'
  requiredPort: number
  primaryListener: FixedLanPort8080Listener | null
  affinity: 'same_system' | 'other_omps' | 'foreign' | 'unknown'
  releaseAuthorization: FixedLanPort8080ReleaseAuthorization | null
  manualSteps: string[]
}

export type FixedLanPort8080ConflictResponse =
  | { ok: true; conflict: FixedLanPort8080ConflictSnapshot }
  | { ok: false; message: string }

export type FixedLanPort8080ReleaseResponse =
  | { ok: true; message: string; portFree: true }
  | { ok: false; message: string; code?: string }
