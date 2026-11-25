import { randomBytes } from 'node:crypto'
import type { PostgresAdminCredentials } from './types.ts'
import { assertSafePostgresIdentifier } from './identifiers.ts'
import { getPostgresClient } from '../platform/getPostgresClient.ts'

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function generateRolePassword(): string {
  return randomBytes(18).toString('base64url')
}

export async function postgresRoleExists(
  credentials: PostgresAdminCredentials,
  roleName: string,
): Promise<boolean> {
  assertSafePostgresIdentifier(roleName, roleName)
  const sql = `SELECT 1 FROM pg_roles WHERE rolname = '${roleName.replace(/'/g, "''")}' LIMIT 1;`
  const client = getPostgresClient()
  const result = await client.runAdminQuery(credentials, sql)
  if (!result.ok) return false
  return /\b1\b/.test(result.stdout)
}

export async function postgresDatabaseExists(
  credentials: PostgresAdminCredentials,
  databaseName: string,
): Promise<boolean> {
  assertSafePostgresIdentifier(databaseName, databaseName)
  const sql = `SELECT 1 FROM pg_database WHERE datname = '${databaseName.replace(/'/g, "''")}' LIMIT 1;`
  const client = getPostgresClient()
  const result = await client.runAdminQuery(credentials, sql)
  if (!result.ok) return false
  return /\b1\b/.test(result.stdout)
}

export async function createPostgresRole(
  credentials: PostgresAdminCredentials,
  roleName: string,
  password: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  assertSafePostgresIdentifier(roleName, roleName)
  if (!/^[A-Za-z0-9_\-!@#$%^&*+=]+$/.test(password)) {
    return { ok: false, code: 'INVALID_PASSWORD' }
  }
  const sql = `CREATE ROLE ${quoteIdent(roleName)} LOGIN PASSWORD '${password.replace(/'/g, "''")}'`
  return getPostgresClient().runAdminQuery(credentials, sql)
}

export async function createPostgresDatabase(
  credentials: PostgresAdminCredentials,
  databaseName: string,
  ownerRole: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  assertSafePostgresIdentifier(databaseName, databaseName)
  assertSafePostgresIdentifier(ownerRole, ownerRole)
  const sql = `CREATE DATABASE ${quoteIdent(databaseName)} OWNER ${quoteIdent(ownerRole)}`
  return getPostgresClient().runAdminQuery(credentials, sql)
}

export async function grantDatabasePrivileges(
  credentials: PostgresAdminCredentials,
  databaseName: string,
  roleName: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  assertSafePostgresIdentifier(databaseName, databaseName)
  assertSafePostgresIdentifier(roleName, roleName)
  const sql = `GRANT ALL PRIVILEGES ON DATABASE ${quoteIdent(databaseName)} TO ${quoteIdent(roleName)}`
  return getPostgresClient().runAdminQuery(credentials, sql)
}

export function generateApplicationPassword(): string {
  return generateRolePassword()
}
