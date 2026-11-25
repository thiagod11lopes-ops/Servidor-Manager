export type DatabaseEngine = 'postgresql' | 'mysql' | 'sqlite' | 'unknown'

export type DatabaseConfidence = 'high' | 'medium' | 'low'

export type DatabaseDetectionInput = {
  dependencies?: string[]
  environmentVariableNames?: string[]
  configurationFiles?: string[]
  directoryEntries?: string[]
  legacyDatabaseRequired?: boolean
  legacyDatabaseDetail?: string
}

export type DatabaseDetectionResult = {
  databaseDetected: boolean
  databaseType: DatabaseEngine
  confidence: DatabaseConfidence
  detectedFrom: string[]
  ormHints: string[]
  environmentVariables: string[]
}

export type InstallationPlanDatabase = {
  required: boolean
  engine: DatabaseEngine | 'none'
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

import type { DatabaseProvisioningRecord } from '../provisioning/types.ts'

export type SystemDatabaseAnalysis = {
  systemId: string
  detection: DatabaseDetectionResult
  database: InstallationPlanDatabase
  host: DatabaseHostStatus
  messages: string[]
  provisioning?: DatabaseProvisioningRecord
}
