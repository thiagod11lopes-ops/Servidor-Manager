export type DatabaseEngine = 'postgresql' | 'mysql' | 'sqlite' | 'unknown' | 'none'

export type DatabaseConfidence = 'high' | 'medium' | 'low'

export type InstallationPlanDatabase = {
  required: boolean
  engine: DatabaseEngine
  engineLabel: string
  confidence: DatabaseConfidence
  detectedFrom: string[]
  prerequisites: string[]
  environmentVariables: string[]
  provisioningRequired: boolean
  notes: string[]
}

export type PostgreSqlHostStatus = {
  psqlAvailable: boolean
  pgIsreadyAvailable: boolean
  serverReachable: boolean | null
  summary: string
}

export type DatabaseHostStatus = {
  postgresql: PostgreSqlHostStatus
}

export type DatabaseDetectionResult = {
  databaseDetected: boolean
  databaseType: Exclude<DatabaseEngine, 'none'>
  confidence: DatabaseConfidence
  detectedFrom: string[]
  ormHints: string[]
  environmentVariables: string[]
}

export type DatabaseProvisioningStatus =
  | 'not_required'
  | 'unavailable'
  | 'ready'
  | 'provisioning'
  | 'provisioned'
  | 'error'

export type DatabaseProvisioningRecord = {
  status: DatabaseProvisioningStatus
  engine: 'postgresql'
  host: string
  port: number
  databaseName: string
  databaseUser: string
  systemId: string
  createdAt: string | null
  updatedAt: string
  passwordStoredSecurely: boolean
  credentialKey: string | null
  lastError: string | null
}

export type SystemDatabaseAnalysis = {
  systemId: string
  detection: DatabaseDetectionResult
  database: InstallationPlanDatabase
  host: DatabaseHostStatus
  messages: string[]
  provisioning?: DatabaseProvisioningRecord
}

export type PostgresAdminCredentialsInput = {
  user: string
  password: string
  host?: string
  port?: number
}

export type DatabaseHostStatusResponse = { ok: true; host: DatabaseHostStatus }

export type SystemDatabaseAnalysisResponse =
  | { ok: true; analysis: SystemDatabaseAnalysis }
  | { ok: false; message: string }

export type SystemDatabaseProvisionResponse =
  | { ok: true; analysis: SystemDatabaseAnalysis; message: string }
  | { ok: false; message: string; analysis?: SystemDatabaseAnalysis }

export type DatabaseSummary = {
  systemsRequiringDatabase: number
  postgresqlServerAvailable: boolean
}

export const databaseConfidenceLabel: Record<DatabaseConfidence, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

export const databaseProvisioningStatusLabel: Record<DatabaseProvisioningStatus, string> = {
  not_required: 'Não necessário',
  unavailable: 'Indisponível',
  ready: 'Pronto para preparar',
  provisioning: 'Preparando banco...',
  provisioned: 'Banco preparado',
  error: 'Erro',
}
