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

export type PostgresAdminCredentials = {
  host: string
  port: number
  user: string
  password: string
}

export type ProvisionPostgresResult =
  | { ok: true; provisioning: DatabaseProvisioningRecord; message: string }
  | { ok: false; message: string; provisioning?: DatabaseProvisioningRecord }
