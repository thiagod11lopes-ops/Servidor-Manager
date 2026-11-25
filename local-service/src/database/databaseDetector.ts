import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  DatabaseConfidence,
  DatabaseDetectionInput,
  DatabaseDetectionResult,
  DatabaseEngine,
  InstallationPlanDatabase,
} from './types/databaseTypes.ts'

const MAX_SCAN_BYTES = 256 * 1024

const DEP_POSTGRES = new Set([
  'pg',
  'postgres',
  'pg-native',
  '@vercel/postgres',
  '@neondatabase/serverless',
])
const DEP_MYSQL = new Set(['mysql', 'mysql2'])
const DEP_SQLITE = new Set(['sqlite3', 'better-sqlite3'])
const ORM_DEPS = new Set(['prisma', '@prisma/client', 'typeorm', 'sequelize', 'drizzle-orm'])

const ENV_POSTGRES = /^DATABASE_URL$|^POSTGRES(_|:|)/i
const ENV_MYSQL = /^MYSQL(_|:)/i
const ENV_SQLITE = /^SQLITE(_|:)/i

function engineLabel(engine: DatabaseEngine): string {
  switch (engine) {
    case 'postgresql':
      return 'PostgreSQL'
    case 'mysql':
      return 'MySQL/MariaDB'
    case 'sqlite':
      return 'SQLite'
    default:
      return 'Não identificado'
  }
}

function bumpConfidence(current: DatabaseConfidence, next: DatabaseConfidence): DatabaseConfidence {
  const rank = { low: 0, medium: 1, high: 2 }
  return rank[next] > rank[current] ? next : current
}

async function readLimited(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile() || stat.size > MAX_SCAN_BYTES) return null
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

function scanTextForEngine(text: string, detectedFrom: string[], source: string): DatabaseEngine {
  const lower = text.toLowerCase()
  if (/provider\s*=\s*["']postgresql["']/.test(lower) || /dialect\s*:\s*['"]postgres/.test(lower)) {
    detectedFrom.push(`${source}: provider PostgreSQL`)
    return 'postgresql'
  }
  if (/provider\s*=\s*["']mysql["']/.test(lower) || /dialect\s*:\s*['"]mysql/.test(lower)) {
    detectedFrom.push(`${source}: provider MySQL`)
    return 'mysql'
  }
  if (/provider\s*=\s*["']sqlite["']/.test(lower) || /dialect\s*:\s*['"]sqlite/.test(lower)) {
    detectedFrom.push(`${source}: provider SQLite`)
    return 'sqlite'
  }
  if (/postgres(ql)?/.test(lower) && /(url|host|connection)/.test(lower)) {
    detectedFrom.push(`${source}: indício PostgreSQL`)
    return 'postgresql'
  }
  return 'unknown'
}

export async function scanProjectDirectoryForDatabase(
  projectDir: string,
): Promise<{ detectedFrom: string[]; ormHints: string[]; engine: DatabaseEngine; confidence: DatabaseConfidence }> {
  const detectedFrom: string[] = []
  const ormHints: string[] = []
  let engine: DatabaseEngine = 'unknown'
  let confidence: DatabaseConfidence = 'low'

  const prismaSchema = path.join(projectDir, 'prisma', 'schema.prisma')
  const prismaRaw = await readLimited(prismaSchema)
  if (prismaRaw) {
    ormHints.push('Prisma')
    detectedFrom.push('prisma/schema.prisma')
    const fromSchema = scanTextForEngine(prismaRaw, detectedFrom, 'schema.prisma')
    if (fromSchema !== 'unknown') {
      engine = fromSchema
      confidence = bumpConfidence(confidence, 'high')
    } else {
      confidence = bumpConfidence(confidence, 'medium')
    }
  }

  const entries = await fs.readdir(projectDir).catch(() => [] as string[])
  for (const name of entries) {
    if (/^drizzle\.config\.(ts|js|mjs|cjs)$/.test(name)) {
      ormHints.push('Drizzle')
      detectedFrom.push(name)
      const raw = await readLimited(path.join(projectDir, name))
      if (raw) {
        const fromDrizzle = scanTextForEngine(raw, detectedFrom, name)
        if (fromDrizzle !== 'unknown') {
          engine = fromDrizzle
          confidence = bumpConfidence(confidence, 'high')
        } else {
          confidence = bumpConfidence(confidence, 'medium')
        }
      }
    }
    if (/^\.sequelizerc$/.test(name) || /^sequelize\.config\.(js|ts)$/.test(name)) {
      ormHints.push('Sequelize')
      detectedFrom.push(name)
      confidence = bumpConfidence(confidence, 'medium')
    }
    if (/^ormconfig\.(json|js|ts)$/.test(name)) {
      ormHints.push('TypeORM')
      detectedFrom.push(name)
      confidence = bumpConfidence(confidence, 'medium')
    }
  }

  return { detectedFrom, ormHints: [...new Set(ormHints)], engine, confidence }
}

export function detectDatabaseFromSignals(input: DatabaseDetectionInput): DatabaseDetectionResult {
  const deps = new Set((input.dependencies ?? []).map((d) => d.toLowerCase()))
  const envNames = input.environmentVariableNames ?? []
  const configFiles = input.configurationFiles ?? []
  const dirEntries = input.directoryEntries ?? []

  const detectedFrom: string[] = []
  const ormHints: string[] = []
  let engine: DatabaseEngine = 'unknown'
  let confidence: DatabaseConfidence = 'low'

  for (const dep of deps) {
    if (DEP_POSTGRES.has(dep)) {
      detectedFrom.push(`dependência: ${dep}`)
      engine = 'postgresql'
      confidence = bumpConfidence(confidence, dep === 'pg' || dep === 'postgres' ? 'high' : 'medium')
    }
    if (DEP_MYSQL.has(dep)) {
      detectedFrom.push(`dependência: ${dep}`)
      if (engine === 'unknown') engine = 'mysql'
      confidence = bumpConfidence(confidence, 'high')
    }
    if (DEP_SQLITE.has(dep)) {
      detectedFrom.push(`dependência: ${dep}`)
      if (engine === 'unknown') engine = 'sqlite'
      confidence = bumpConfidence(confidence, 'high')
    }
    if (ORM_DEPS.has(dep)) {
      ormHints.push(dep === '@prisma/client' ? 'Prisma' : dep)
      detectedFrom.push(`dependência: ${dep}`)
      confidence = bumpConfidence(confidence, 'medium')
    }
  }

  for (const key of envNames) {
    if (ENV_POSTGRES.test(key)) {
      detectedFrom.push(`variável: ${key}`)
      engine = engine === 'unknown' ? 'postgresql' : engine
      confidence = bumpConfidence(confidence, key === 'DATABASE_URL' ? 'high' : 'medium')
    }
    if (ENV_MYSQL.test(key)) {
      detectedFrom.push(`variável: ${key}`)
      if (engine === 'unknown') engine = 'mysql'
      confidence = bumpConfidence(confidence, 'medium')
    }
    if (ENV_SQLITE.test(key)) {
      detectedFrom.push(`variável: ${key}`)
      if (engine === 'unknown') engine = 'sqlite'
      confidence = bumpConfidence(confidence, 'medium')
    }
  }

  for (const file of [...configFiles, ...dirEntries.map((e) => e.replace(/\/$/, ''))]) {
    if (/^prisma\/schema\.prisma$/i.test(file) || file === 'schema.prisma') {
      detectedFrom.push('arquivo: prisma/schema.prisma')
      ormHints.push('Prisma')
      confidence = bumpConfidence(confidence, 'medium')
    }
    if (/drizzle\.config\./i.test(file)) {
      detectedFrom.push(`arquivo: ${file}`)
      ormHints.push('Drizzle')
      confidence = bumpConfidence(confidence, 'medium')
    }
  }

  if (input.legacyDatabaseRequired && input.legacyDatabaseDetail) {
    detectedFrom.push('análise legada')
    const detail = input.legacyDatabaseDetail.toLowerCase()
    if (detail.includes('postgres')) {
      engine = engine === 'unknown' ? 'postgresql' : engine
      confidence = bumpConfidence(confidence, 'medium')
    } else if (detail.includes('mysql')) {
      engine = engine === 'unknown' ? 'mysql' : engine
      confidence = bumpConfidence(confidence, 'medium')
    } else if (detail.includes('sqlite')) {
      engine = engine === 'unknown' ? 'sqlite' : engine
      confidence = bumpConfidence(confidence, 'medium')
    }
  }

  const databaseDetected =
    engine !== 'unknown' && (confidence === 'high' || confidence === 'medium' || deps.size > 0)

  if (engine !== 'unknown' && confidence === 'low') {
    confidence = 'medium'
  }

  const dbEnvKeys = envNames.filter(
    (key) => ENV_POSTGRES.test(key) || ENV_MYSQL.test(key) || ENV_SQLITE.test(key) || /DATABASE/i.test(key),
  )

  return {
    databaseDetected: databaseDetected && engine !== 'unknown',
    databaseType: engine,
    confidence,
    detectedFrom: [...new Set(detectedFrom)],
    ormHints: [...new Set(ormHints)],
    environmentVariables: [...new Set(dbEnvKeys)],
  }
}

export function buildInstallationPlanDatabase(
  detection: DatabaseDetectionResult,
): InstallationPlanDatabase {
  if (!detection.databaseDetected || detection.databaseType === 'unknown') {
    return {
      required: false,
      engine: 'none',
      engineLabel: 'Não identificado',
      confidence: detection.confidence,
      detectedFrom: detection.detectedFrom,
      prerequisites: [],
      environmentVariables: detection.environmentVariables,
      provisioningRequired: false,
      notes: ['Nenhum banco de dados claramente identificado nesta etapa.'],
    }
  }

  const prerequisites: string[] = []
  if (detection.databaseType === 'postgresql') {
    prerequisites.push('Servidor PostgreSQL local (cliente psql / pg_isready)')
  }
  if (detection.databaseType === 'mysql') {
    prerequisites.push('Servidor MySQL/MariaDB local (verificação futura)')
  }
  if (detection.databaseType === 'sqlite') {
    prerequisites.push('Arquivo SQLite ou biblioteca embarcada (sem servidor separado)')
  }

  return {
    required: true,
    engine: detection.databaseType,
    engineLabel: engineLabel(detection.databaseType),
    confidence: detection.confidence,
    detectedFrom: detection.detectedFrom,
    prerequisites,
    environmentVariables: detection.environmentVariables,
    provisioningRequired: detection.databaseType === 'postgresql' || detection.databaseType === 'mysql',
    notes: [
      'Nenhum banco foi criado nesta etapa.',
      'Credenciais não são inferidas — apenas nomes de variáveis quando identificados.',
    ],
  }
}

export async function detectDatabaseForProject(
  input: DatabaseDetectionInput,
  projectDir?: string,
): Promise<DatabaseDetectionResult> {
  const base = detectDatabaseFromSignals(input)
  if (!projectDir) return base

  const scan = await scanProjectDirectoryForDatabase(projectDir)
  const mergedFrom = [...new Set([...base.detectedFrom, ...scan.detectedFrom])]
  const mergedOrm = [...new Set([...base.ormHints, ...scan.ormHints])]

  let engine = base.databaseType
  if (scan.engine !== 'unknown') {
    engine = scan.engine
  }

  let confidence = base.confidence
  confidence = bumpConfidence(confidence, scan.confidence)

  const databaseDetected = engine !== 'unknown' && (mergedFrom.length > 0 || base.databaseDetected)

  return {
    databaseDetected,
    databaseType: engine,
    confidence,
    detectedFrom: mergedFrom,
    ormHints: mergedOrm,
    environmentVariables: base.environmentVariables,
  }
}
