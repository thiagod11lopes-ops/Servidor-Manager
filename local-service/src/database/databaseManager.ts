import fs from 'node:fs/promises'
import { getProjectDirectory } from '../installation/paths.ts'
import { readInstallationManifest } from '../runtime/installationManifest.ts'
import {
  buildInstallationPlanDatabase,
  detectDatabaseForProject,
  detectDatabaseFromSignals,
} from './databaseDetector.ts'
import { getHostProbePlatform } from './platform/index.ts'
import type {
  DatabaseHostStatus,
  DatabaseDetectionInput,
  InstallationPlanDatabase,
  SystemDatabaseAnalysis,
} from './types/databaseTypes.ts'
import { getDatabaseProfilePath } from './databasePaths.ts'
import { readDatabaseProfile, writeDatabaseProfile } from './profileStore.ts'
import { provisionPostgresForSystem } from './provisioning/postgresProvisioner.ts'
import type { PostgresAdminCredentials } from './provisioning/types.ts'

export async function getDatabaseHostStatus(): Promise<{ ok: true; host: DatabaseHostStatus }> {
  const platform = getHostProbePlatform()
  const postgresql = await platform.probePostgreSql()
  return { ok: true, host: { postgresql } }
}

function messagesForAnalysis(
  database: InstallationPlanDatabase,
  host: DatabaseHostStatus,
): string[] {
  const messages: string[] = [...database.notes]

  if (database.engine === 'postgresql') {
    if (!host.postgresql.psqlAvailable && !host.postgresql.pgIsreadyAvailable) {
      messages.push(
        'PostgreSQL não encontrado. O sistema aparentemente necessita de PostgreSQL. A instalação ainda não foi realizada.',
      )
    } else if (host.postgresql.serverReachable === true) {
      messages.push('PostgreSQL detectado. Servidor local disponível.')
    } else if (host.postgresql.serverReachable === false) {
      messages.push(
        'Ferramentas PostgreSQL presentes, mas o servidor local não respondeu. Instalar/configurar PostgreSQL será necessário.',
      )
    }
  }

  return messages
}

export async function analyzeDatabaseFromSignals(
  input: DatabaseDetectionInput,
  projectDir?: string,
): Promise<{ detection: Awaited<ReturnType<typeof detectDatabaseForProject>>; database: InstallationPlanDatabase }> {
  const detection = await detectDatabaseForProject(input, projectDir)
  const database = buildInstallationPlanDatabase(detection)
  return { detection, database }
}

export async function analyzeSystemDatabase(systemId: string): Promise<
  | { ok: true; analysis: SystemDatabaseAnalysis }
  | { ok: false; message: string }
> {
  const manifest = await readInstallationManifest(systemId)
  if (!manifest) {
    return { ok: false, message: 'Instalação não encontrada para este sistema.' }
  }

  let projectDir: string | undefined
  try {
    await fs.access(manifest.projectDirectory)
    projectDir = manifest.projectDirectory
  } catch {
    projectDir = undefined
  }

  const input: DatabaseDetectionInput = {
    dependencies: [],
    environmentVariableNames: [],
    configurationFiles: [],
    directoryEntries: [],
    legacyDatabaseRequired: false,
    legacyDatabaseDetail: 'Não identificado',
  }

  if (projectDir) {
    const entries = await fs.readdir(projectDir).catch(() => [] as string[])
    input.directoryEntries = entries
    input.configurationFiles = entries.filter((name) =>
      /^\.env\.example$/i.test(name) || /^prisma\//.test(name) || /drizzle\.config\./.test(name),
    )

    const envExample = entries.find((name) => /^\.env\.example$/i.test(name))
    if (envExample) {
      try {
        const raw = await fs.readFile(`${projectDir}/${envExample}`, 'utf8')
        for (const line of raw.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eq = trimmed.indexOf('=')
          if (eq <= 0) continue
          const key = trimmed.slice(0, eq).trim()
          if (/^[A-Z0-9_]+$/i.test(key)) input.environmentVariableNames?.push(key)
        }
      } catch {
        // ignore
      }
    }

    try {
      const raw = await fs.readFile(`${projectDir}/package.json`, 'utf8')
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      input.dependencies = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ]
    } catch {
      // ignore
    }
  }

  const { detection, database } = await analyzeDatabaseFromSignals(input, projectDir)
  const host = (await getDatabaseHostStatus()).host
  const messages = messagesForAnalysis(database, host)

  const previous = await readDatabaseProfile(systemId)

  const analysis: SystemDatabaseAnalysis = {
    systemId,
    detection,
    database,
    host,
    messages,
    provisioning: previous?.provisioning,
  }

  await fs.mkdir(getProjectDirectory(systemId), { recursive: true }).catch(() => undefined)
  await writeDatabaseProfile({
    version: 2,
    systemId,
    analysis,
    provisioning: previous?.provisioning,
    updatedAt: new Date().toISOString(),
  })

  return { ok: true, analysis }
}

export async function provisionSystemDatabase(
  systemId: string,
  admin?: PostgresAdminCredentials,
) {
  const analyzed = await analyzeSystemDatabase(systemId)
  if (!analyzed.ok) {
    return analyzed
  }

  const result = await provisionPostgresForSystem(systemId, analyzed.analysis, admin)
  if (!result.provisioning) {
    return { ok: false as const, message: result.message }
  }

  const analysis: SystemDatabaseAnalysis = {
    ...analyzed.analysis,
    provisioning: result.provisioning,
  }

  await writeDatabaseProfile({
    version: 2,
    systemId,
    analysis,
    provisioning: result.provisioning,
    updatedAt: new Date().toISOString(),
  })

  return result.ok
    ? { ok: true as const, analysis, message: result.message }
    : { ok: false as const, message: result.message, analysis }
}

export function buildPlanDatabaseSection(input: DatabaseDetectionInput): InstallationPlanDatabase {
  const detection = detectDatabaseFromSignals(input)
  return buildInstallationPlanDatabase(detection)
}

export async function collectDatabaseSummary(): Promise<{
  systemsRequiringDatabase: number
  postgresqlServerAvailable: boolean
}> {
  let systemsRequiringDatabase = 0
  let postgresqlServerAvailable = false

  try {
    const host = await getDatabaseHostStatus()
    postgresqlServerAvailable = host.host.postgresql.serverReachable === true
  } catch {
    postgresqlServerAvailable = false
  }

  const { getSystemsRoot } = await import('../installation/paths.ts')
  const entries = await fs.readdir(getSystemsRoot()).catch(() => [] as string[])

  for (const entry of entries) {
    try {
      const profilePath = getDatabaseProfilePath(entry)
      const raw = await fs.readFile(profilePath, 'utf8')
      const parsed = JSON.parse(raw) as { analysis?: SystemDatabaseAnalysis; database?: SystemDatabaseAnalysis['database'] }
      const db = parsed.analysis?.database ?? parsed.database
      if (db?.required) systemsRequiringDatabase += 1
    } catch {
      // no profile yet
    }
  }

  return { systemsRequiringDatabase, postgresqlServerAvailable }
}
