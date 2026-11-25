import type { RemoteValidationState } from './remoteValidation.ts'
import type { SystemAccessMode } from './systemAccessMode.ts'

export type SystemRuntimeState =
  | 'instalado'
  | 'iniciando'
  | 'executando'
  | 'parado'
  | 'erro'
  | 'encerrando'

export type { RemoteValidationState } from './remoteValidation.ts'

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

export type SystemRuntimeStatus = {
  systemId: string
  /** null = modo ainda não persistido (instalação pendente ou legado). */
  accessMode?: SystemAccessMode | null
  state: SystemRuntimeState
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
  loginUrl?: string | null
  runtimeKind?: 'manifest-lan' | 'process'
  supabaseRunning?: boolean
  caddyRunning?: boolean
  remoteAccess?: SystemRemoteAccess
  localHttpReachable?: boolean | null
  localHttpStatus?: number
  localHttpProbeUrl?: string
}

export type SystemRuntimeResponse =
  | { ok: true; status: SystemRuntimeStatus }
  | { ok: false; message: string; status?: SystemRuntimeStatus }

export const systemRuntimeStateLabel: Record<SystemRuntimeState, string> = {
  instalado: 'Instalado (parado)',
  iniciando: 'Iniciando',
  executando: 'Executando',
  parado: 'Parado',
  erro: 'Erro',
  encerrando: 'Encerrando',
}
