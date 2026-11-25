import { readDatabaseProfile, writeDatabaseProfile } from '../profileStore.ts'
import { getHostProbePlatform } from '../platform/index.ts'
import { getCredentialStoreForSystem } from '../secrets/getCredentialStore.ts'
import type { SystemDatabaseAnalysis } from '../types/databaseTypes.ts'
import { deriveDatabaseName, deriveDatabaseUser } from './identifiers.ts'
import { writeConnectionConfig } from './connectionConfigWriter.ts'
import {
  createPostgresDatabase,
  createPostgresRole,
  generateApplicationPassword,
  grantDatabasePrivileges,
  postgresDatabaseExists,
  postgresRoleExists,
} from './postgresOperations.ts'
import type {
  DatabaseProvisioningRecord,
  PostgresAdminCredentials,
  ProvisionPostgresResult,
} from './types.ts'
const CREDENTIAL_KEY = 'app-db-password'

function nowIso(): string {
  return new Date().toISOString()
}

function baseProvisioningRecord(systemId: string): DatabaseProvisioningRecord {
  return {
    status: 'ready',
    engine: 'postgresql',
    host: '127.0.0.1',
    port: 5432,
    databaseName: deriveDatabaseName(systemId),
    databaseUser: deriveDatabaseUser(systemId),
    systemId,
    createdAt: null,
    updatedAt: nowIso(),
    passwordStoredSecurely: false,
    credentialKey: null,
    lastError: null,
  }
}

async function saveProfile(
  analysis: SystemDatabaseAnalysis,
  provisioning: DatabaseProvisioningRecord,
): Promise<void> {
  const mergedAnalysis: SystemDatabaseAnalysis = { ...analysis, provisioning }
  await writeDatabaseProfile({
    version: 2,
    systemId: analysis.systemId,
    analysis: mergedAnalysis,
    provisioning,
    updatedAt: nowIso(),
  })
}

export async function getProvisioningState(systemId: string): Promise<DatabaseProvisioningRecord | null> {
  const profile = await readDatabaseProfile(systemId)
  return profile?.provisioning ?? null
}

export async function provisionPostgresForSystem(
  systemId: string,
  analysis: SystemDatabaseAnalysis,
  admin?: PostgresAdminCredentials,
): Promise<ProvisionPostgresResult> {
  if (!analysis.database.required || analysis.database.engine !== 'postgresql') {
    const record: DatabaseProvisioningRecord = {
      ...baseProvisioningRecord(systemId),
      status: 'not_required',
    }
    await saveProfile(analysis, record)
    return { ok: false, message: 'Este sistema não requer PostgreSQL.', provisioning: record }
  }

  const hostStatus = { postgresql: await getHostProbePlatform().probePostgreSql() }
  const hostReady =
    hostStatus.postgresql.serverReachable === true &&
    hostStatus.postgresql.psqlAvailable

  if (!hostReady) {
    const record: DatabaseProvisioningRecord = {
      ...baseProvisioningRecord(systemId),
      status: 'unavailable',
      lastError:
        'PostgreSQL não encontrado ou indisponível. Instale ou inicie o serviço local — nenhuma instalação automática foi realizada.',
    }
    await saveProfile(analysis, record)
    return {
      ok: false,
      message: record.lastError,
      provisioning: record,
    }
  }

  const profile = await readDatabaseProfile(systemId)
  const existing = profile?.provisioning

  if (existing?.status === 'provisioned') {
    return {
      ok: true,
      message: 'Banco já provisionado para este sistema.',
      provisioning: existing,
    }
  }

  if (!admin?.user || !admin.password) {
    const record: DatabaseProvisioningRecord = {
      ...baseProvisioningRecord(systemId),
      status: 'ready',
      lastError: null,
    }
    await saveProfile(analysis, record)
    return {
      ok: false,
      message:
        'Credenciais administrativas do PostgreSQL são necessárias para criar banco e usuário. Informe um usuário com permissão de criação (não use o superusuário da aplicação).',
      provisioning: record,
    }
  }

  const credentials: PostgresAdminCredentials = {
    host: admin.host ?? '127.0.0.1',
    port: admin.port ?? 5432,
    user: admin.user.trim(),
    password: admin.password,
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(credentials.user)) {
    return { ok: false, message: 'Usuário administrativo inválido.' }
  }

  const databaseName = deriveDatabaseName(systemId)
  const databaseUser = deriveDatabaseUser(systemId)

  const provisioning: DatabaseProvisioningRecord = {
    ...baseProvisioningRecord(systemId),
    status: 'provisioning',
    host: credentials.host,
    port: credentials.port,
    databaseName,
    databaseUser,
  }
  await saveProfile(analysis, provisioning)

  try {
    const roleExists = await postgresRoleExists(credentials, databaseUser)
    const dbExists = await postgresDatabaseExists(credentials, databaseName)

    if (roleExists && dbExists) {
      const done: DatabaseProvisioningRecord = {
        ...provisioning,
        status: 'provisioned',
        createdAt: existing?.createdAt ?? nowIso(),
        updatedAt: nowIso(),
        lastError: null,
      }
      await saveProfile(analysis, done)
      await writeConnectionConfig(systemId, done)
      return { ok: true, message: 'Banco preparado (já existia para este sistema).', provisioning: done }
    }

    if (roleExists !== dbExists) {
      const partial: DatabaseProvisioningRecord = {
        ...provisioning,
        status: 'error',
        lastError:
          'Estado parcial detectado (usuário/banco). Intervenção manual necessária — o Manager não executa DROP.',
        updatedAt: nowIso(),
      }
      await saveProfile(analysis, partial)
      return { ok: false, message: partial.lastError, provisioning: partial }
    }

    const appPassword = generateApplicationPassword()
    const createRole = await createPostgresRole(credentials, databaseUser, appPassword)
    if (!createRole.ok) {
      const failed: DatabaseProvisioningRecord = {
        ...provisioning,
        status: 'error',
        lastError:
          createRole.code === 'ADMIN_AUTH_FAILED'
            ? 'Falha de autenticação administrativa no PostgreSQL.'
            : 'Não foi possível criar o usuário do banco.',
        updatedAt: nowIso(),
      }
      await saveProfile(analysis, failed)
      return { ok: false, message: failed.lastError ?? 'Erro', provisioning: failed }
    }

    const createDb = await createPostgresDatabase(credentials, databaseName, databaseUser)
    if (!createDb.ok) {
      const failed: DatabaseProvisioningRecord = {
        ...provisioning,
        status: 'error',
        lastError: 'Não foi possível criar o banco de dados.',
        updatedAt: nowIso(),
      }
      await saveProfile(analysis, failed)
      return { ok: false, message: failed.lastError, provisioning: failed }
    }

    const grant = await grantDatabasePrivileges(credentials, databaseName, databaseUser)
    if (!grant.ok) {
      const failed: DatabaseProvisioningRecord = {
        ...provisioning,
        status: 'error',
        lastError: 'Banco criado, mas falha ao conceder permissões.',
        updatedAt: nowIso(),
      }
      await saveProfile(analysis, failed)
      return { ok: false, message: failed.lastError, provisioning: failed }
    }

    const store = getCredentialStoreForSystem(systemId)
    const stored = await store.store(CREDENTIAL_KEY, appPassword)

    const done: DatabaseProvisioningRecord = {
      ...provisioning,
      status: 'provisioned',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      passwordStoredSecurely: stored,
      credentialKey: stored ? CREDENTIAL_KEY : null,
      lastError: stored
        ? null
        : 'Senha do usuário do banco não pôde ser armazenada com DPAPI. O banco foi criado, mas será necessário definir a senha manualmente.',
    }

    await saveProfile(analysis, done)
    await writeConnectionConfig(systemId, done)

    return {
      ok: true,
      message: stored ? 'Banco preparado.' : (done.lastError ?? 'Banco preparado com ressalvas.'),
      provisioning: done,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado no provisionamento.'
    const failed: DatabaseProvisioningRecord = {
      ...provisioning,
      status: 'error',
      lastError: message,
      updatedAt: nowIso(),
    }
    await saveProfile(analysis, failed)
    return { ok: false, message: 'Não foi possível preparar o banco.', provisioning: failed }
  }
}
