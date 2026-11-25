import type { SystemAccessMode } from '../config/systemAccessMode.ts'
import type { FixedLanPort8080ConflictApiSnapshot } from '../serverManifest/fixedLanPort8080Conflict.ts'

export type RuntimeState =
  | 'instalado'
  | 'iniciando'
  | 'executando'
  | 'parado'
  | 'erro'
  | 'encerrando'

export type RemoteValidationState =
  | 'not_applicable'
  | 'candidate_ready'
  | 'needs_external_probe'
  | 'external_report_received'
  | 'external_probe_failed'
  | 'validated'
  | 'failed'

export type SystemRemoteAccess = {
  candidateUrl: string
  basis: 'loginUrl' | 'lanAccessUrl'
  remoteValidated: false
  summary: string
  remoteValidationState?: RemoteValidationState
  remoteValidationSummary?: string
  externalProbeTrustLevel?: 'session_binding_only'
  externalProbeAcceptedAt?: string
  externalProbeHttpStatus?: number
}

export type { SystemAccessMode }

export type RuntimeStateSnapshot = {
  systemId: string
  /** null = ainda não escolhido (pré-instalação ou legado). */
  accessMode?: SystemAccessMode | null
  state: RuntimeState
  pid: number | null
  startedAt: string | null
  stoppedAt: string | null
  uptimeSeconds: number | null
  port: number | null
  workingDirectory: string
  startCommand: string | null
  lastError: string | null
  updatedAt: string
  lanAccessUrl?: string | null
  /** URL /login para Instalador OPMS (manifest supabase-local-v1). */
  loginUrl?: string | null
  runtimeKind?: 'manifest-lan' | 'process'
  supabaseRunning?: boolean
  caddyRunning?: boolean
  remoteAccess?: SystemRemoteAccess
  /** null = não verificado ou não aplicável */
  localHttpReachable?: boolean | null
  localHttpStatus?: number
  localHttpProbeUrl?: string
}

export type RuntimeActionResponse =
  | { ok: true; status: RuntimeStateSnapshot }
  | {
      ok: false
      message: string
      status?: RuntimeStateSnapshot
      code?: 'FIXED_LAN_HTTP_PORT_CONFLICT'
      fixedLanPort8080Conflict?: FixedLanPort8080ConflictApiSnapshot
    }
