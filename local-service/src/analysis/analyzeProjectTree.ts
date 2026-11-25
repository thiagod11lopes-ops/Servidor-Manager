import fs from 'node:fs/promises'
import path from 'node:path'

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'vendor',
  '.turbo',
  '.cache',
])

const MAX_FILE_BYTES = 512 * 1024

type PackageJson = {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

type AnalysisInput = {
  projectDir: string
  sourceUrl: string
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function readTextFileLimited(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

async function listTopLevelEntries(projectDir: string): Promise<string[]> {
  const entries = await fs.readdir(projectDir, { withFileTypes: true })
  return entries
    .filter((entry) => !entry.name.startsWith('.') || entry.name === '.env.example')
    .slice(0, 24)
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
}

async function findConfigFile(projectDir: string, pattern: RegExp): Promise<string | null> {
  const entries = await fs.readdir(projectDir)
  const match = entries.find((name) => pattern.test(name))
  return match ?? null
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function collectDependencyNames(pkg: PackageJson, limit = 12): string[] {
  const names = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]
  return [...new Set(names)].slice(0, limit)
}

function detectPackageManager(files: string[]): string {
  if (files.includes('pnpm-lock.yaml')) return 'pnpm'
  if (files.includes('yarn.lock')) return 'yarn'
  if (files.includes('bun.lockb')) return 'bun'
  if (files.includes('package-lock.json')) return 'npm'
  return 'npm'
}

function installCommand(manager: string): string {
  if (manager === 'pnpm') return 'pnpm install'
  if (manager === 'yarn') return 'yarn install'
  if (manager === 'bun') return 'bun install'
  return 'npm install'
}

function runCommand(manager: string, script: string): string {
  if (manager === 'npm') return `npm run ${script}`
  if (manager === 'yarn') return `yarn ${script}`
  return `${manager} run ${script}`
}

const DB_HINTS: Record<string, string> = {
  pg: 'PostgreSQL',
  postgres: 'PostgreSQL',
  'pg-native': 'PostgreSQL',
  mysql: 'MySQL',
  mysql2: 'MySQL',
  mongodb: 'MongoDB',
  mongoose: 'MongoDB',
  prisma: 'Prisma (ORM)',
  '@prisma/client': 'Prisma (ORM)',
  typeorm: 'TypeORM',
  sequelize: 'Sequelize',
  sqlite3: 'SQLite',
  'better-sqlite3': 'SQLite',
}

function detectDatabase(deps: Record<string, string>): { required: boolean; detail: string } {
  const hits = Object.keys(deps)
    .map((name) => DB_HINTS[name])
    .filter(Boolean)

  const unique = [...new Set(hits)]
  if (unique.length === 0) {
    return { required: false, detail: 'Não identificado' }
  }

  return { required: true, detail: unique.join(', ') }
}

function detectNodeStack(
  pkg: PackageJson,
  files: string[],
  hasViteConfig: boolean,
  hasNextConfig: boolean,
) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const technologies = new Set<string>()

  if (files.includes('tsconfig.json')) technologies.add('TypeScript')
  if (deps.typescript) technologies.add('TypeScript')
  technologies.add('JavaScript')

  let framework = 'Não identificado'
  let buildTool = 'Não identificado'
  let projectType = 'Projeto Node.js'
  let hasFrontend = false
  let hasBackend = false

  if (deps.next) {
    framework = 'Next.js'
    buildTool = 'Next.js'
    projectType = 'Aplicação Web'
    hasFrontend = true
    hasBackend = true
    technologies.add('Next.js')
    technologies.add('React')
  } else if (deps.react) {
    framework = 'React'
    projectType = 'Aplicação Web'
    hasFrontend = true
    technologies.add('React')
    if (hasViteConfig || deps.vite) {
      buildTool = 'Vite'
      technologies.add('Vite')
    }
  } else if (deps.vue) {
    framework = 'Vue'
    projectType = 'Aplicação Web'
    hasFrontend = true
    technologies.add('Vue')
    if (hasViteConfig || deps.vite) {
      buildTool = 'Vite'
      technologies.add('Vite')
    }
  } else if (deps['@angular/core']) {
    framework = 'Angular'
    projectType = 'Aplicação Web'
    hasFrontend = true
    technologies.add('Angular')
  } else if (deps.express) {
    framework = 'Express'
    projectType = 'API / Backend'
    hasBackend = true
    technologies.add('Express')
  } else if (deps.fastify) {
    framework = 'Fastify'
    projectType = 'API / Backend'
    hasBackend = true
    technologies.add('Fastify')
  } else if (deps['@nestjs/core']) {
    framework = 'NestJS'
    projectType = 'API / Backend'
    hasBackend = true
    technologies.add('NestJS')
  }

  if (hasViteConfig && buildTool === 'Não identificado') {
    buildTool = 'Vite'
    technologies.add('Vite')
  }

  if (hasNextConfig && buildTool === 'Não identificado') {
    buildTool = 'Next.js'
  }

  if (files.includes('index.html') && !hasBackend) {
    hasFrontend = true
    if (projectType === 'Projeto Node.js') projectType = 'Aplicação Web'
  }

  const database = detectDatabase(deps)

  return {
    framework,
    buildTool,
    projectType,
    technologies: [...technologies],
    hasFrontend,
    hasBackend,
    backendDetail: hasBackend ? `Backend identificado (${framework})` : 'Não identificado',
    backendRequired: hasBackend,
    databaseRequired: database.required,
    databaseDetail: database.detail,
    dependencies: collectDependencyNames(pkg),
  }
}

async function analyzePython(projectDir: string, files: string[]) {
  const technologies = ['Python']
  let framework = 'Não identificado'
  let hasBackend = false

  const requirements = await readTextFileLimited(path.join(projectDir, 'requirements.txt'))
  const pyproject = await readTextFileLimited(path.join(projectDir, 'pyproject.toml'))
  const corpus = `${requirements ?? ''}\n${pyproject ?? ''}`.toLowerCase()

  if (corpus.includes('django')) {
    framework = 'Django'
    hasBackend = true
    technologies.push('Django')
  } else if (corpus.includes('fastapi')) {
    framework = 'FastAPI'
    hasBackend = true
    technologies.push('FastAPI')
  } else if (corpus.includes('flask')) {
    framework = 'Flask'
    hasBackend = true
    technologies.push('Flask')
  }

  return {
    primaryLanguage: 'Python',
    projectType: hasBackend ? 'API / Backend' : 'Projeto Python',
    framework,
    buildTool: 'Não identificado',
    packageManager: 'pip',
    hasPackageJson: false,
    hasFrontend: files.includes('templates/') || files.includes('static/'),
    hasBackend,
    backendRequired: hasBackend,
    backendDetail: hasBackend ? `Backend identificado (${framework})` : 'Não identificado',
    databaseRequired: /postgres|mysql|sqlite|mongo/.test(corpus),
    databaseDetail: /postgres/.test(corpus)
      ? 'PostgreSQL (indício em dependências)'
      : /sqlite/.test(corpus)
        ? 'SQLite (indício em dependências)'
        : 'Não identificado',
    technologies,
    dependencies: [],
    installCommands: ['pip install -r requirements.txt'],
    buildCommands: [] as string[],
    devCommands: [] as string[],
    runCommands: [] as string[],
  }
}

const PREFERRED_PROJECT_DIRS = ['frontend', 'client', 'web', 'app', 'packages/frontend']

export async function resolveProjectRoot(cloneDir: string): Promise<string> {
  const pkgAtRoot = await pathExists(path.join(cloneDir, 'package.json'))
  if (pkgAtRoot) return cloneDir

  for (const relative of PREFERRED_PROJECT_DIRS) {
    const nested = path.join(cloneDir, relative.replace(/\//g, path.sep), 'package.json')
    if (await pathExists(nested)) {
      return path.dirname(nested)
    }
  }

  const entries = await fs.readdir(cloneDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue
    const nested = path.join(cloneDir, entry.name, 'package.json')
    if (await pathExists(nested)) return path.join(cloneDir, entry.name)
  }

  return cloneDir
}

export async function analyzeProjectTree({ projectDir, sourceUrl }: AnalysisInput) {
  const root = await resolveProjectRoot(projectDir)
  const topLevel = await fs.readdir(root)
  const directoryStructure = await listTopLevelEntries(root)

  const hasPackageJson = topLevel.includes('package.json')
  const hasViteConfig = Boolean(await findConfigFile(root, /^vite\.config\.(ts|js|mjs|cjs)$/))
  const hasNextConfig = Boolean(await findConfigFile(root, /^next\.config\.(ts|js|mjs|cjs)$/))

  if (hasPackageJson) {
    const pkg =
      parseJson<PackageJson>(await readTextFileLimited(path.join(root, 'package.json'))) ?? {}
    const manager = detectPackageManager(topLevel)
    const stack = detectNodeStack(pkg, topLevel, hasViteConfig, hasNextConfig)
    const scripts = pkg.scripts ?? {}

    const buildCommands = scripts.build ? [runCommand(manager, 'build')] : []
    const devCommands = scripts.dev ? [runCommand(manager, 'dev')] : []
    const runCommands = [
      ...(scripts.preview ? [runCommand(manager, 'preview')] : []),
      ...(scripts.start ? [runCommand(manager, 'start')] : []),
      ...devCommands,
    ]

    return {
      source: 'local-service' as const,
      mock: false,
      sourceUrl,
      projectName: pkg.name ?? path.basename(root),
      primaryLanguage: topLevel.includes('tsconfig.json') ? 'TypeScript' : 'JavaScript',
      projectType: stack.projectType,
      technologies: stack.technologies,
      hasPackageJson: true,
      framework: stack.framework,
      buildTool: stack.buildTool,
      packageManager: manager,
      hasFrontend: stack.hasFrontend,
      hasBackend: stack.hasBackend,
      backendRequired: stack.backendRequired,
      backendDetail: stack.backendDetail,
      databaseRequired: stack.databaseRequired,
      databaseDetail: stack.databaseDetail,
      dependencies: stack.dependencies,
      installCommands: [installCommand(manager)],
      buildCommands,
      devCommands,
      runCommands,
      directoryStructure,
      analyzedAt: new Date().toISOString(),
      disclaimer: 'Análise real dos arquivos obtidos via Git. Nenhum script do projeto foi executado.',
    }
  }

  if (topLevel.includes('requirements.txt') || topLevel.includes('pyproject.toml')) {
    const py = await analyzePython(root, directoryStructure)
    return {
      source: 'local-service' as const,
      mock: false,
      sourceUrl,
      projectName: path.basename(root),
      directoryStructure,
      analyzedAt: new Date().toISOString(),
      disclaimer: 'Análise real dos arquivos obtidos via Git. Nenhum script do projeto foi executado.',
      ...py,
    }
  }

  if (topLevel.includes('Cargo.toml')) {
    return {
      source: 'local-service' as const,
      mock: false,
      sourceUrl,
      projectName: path.basename(root),
      primaryLanguage: 'Rust',
      projectType: 'Projeto Rust',
      technologies: ['Rust'],
      hasPackageJson: false,
      framework: 'Cargo',
      buildTool: 'Cargo',
      packageManager: 'cargo',
      hasFrontend: false,
      hasBackend: false,
      backendRequired: false,
      backendDetail: 'Não identificado',
      databaseRequired: false,
      databaseDetail: 'Não identificado',
      dependencies: [],
      installCommands: ['cargo build'],
      buildCommands: ['cargo build'],
      devCommands: ['cargo run'],
      runCommands: ['cargo run'],
      directoryStructure,
      analyzedAt: new Date().toISOString(),
      disclaimer: 'Análise real dos arquivos obtidos via Git. Nenhum script do projeto foi executado.',
    }
  }

  if (topLevel.includes('composer.json')) {
    return {
      source: 'local-service' as const,
      mock: false,
      sourceUrl,
      projectName: path.basename(root),
      primaryLanguage: 'PHP',
      projectType: 'Projeto PHP',
      technologies: ['PHP'],
      hasPackageJson: false,
      framework: 'Composer',
      buildTool: 'Composer',
      packageManager: 'composer',
      hasFrontend: false,
      hasBackend: true,
      backendRequired: true,
      backendDetail: 'Projeto PHP (Composer)',
      databaseRequired: false,
      databaseDetail: 'Não identificado',
      dependencies: [],
      installCommands: ['composer install'],
      buildCommands: [],
      devCommands: [],
      runCommands: [],
      directoryStructure,
      analyzedAt: new Date().toISOString(),
      disclaimer: 'Análise real dos arquivos obtidos via Git. Nenhum script do projeto foi executado.',
    }
  }

  return {
    source: 'local-service' as const,
    mock: false,
    sourceUrl,
    projectName: path.basename(root),
    primaryLanguage: 'Não identificado',
    projectType: 'Projeto genérico',
    technologies: [],
    hasPackageJson: false,
    framework: 'Não identificado',
    buildTool: 'Não identificado',
    packageManager: 'Não identificado',
    hasFrontend: false,
    hasBackend: false,
    backendRequired: false,
    backendDetail: 'Não identificado',
    databaseRequired: false,
    databaseDetail: 'Não identificado',
    dependencies: [],
    installCommands: [],
    buildCommands: [],
    devCommands: [],
    runCommands: [],
    directoryStructure,
    analyzedAt: new Date().toISOString(),
    disclaimer: 'Análise real dos arquivos obtidos via Git. Nenhum script do projeto foi executado.',
  }
}
