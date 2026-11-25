import path from 'node:path'
import type { PlanHints } from '../analysis/collectPlanHints.ts'
import { getSystemsRoot } from '../installation/paths.ts'
import { buildPlanDatabaseSection } from '../database/databaseManager.ts'
import type { InstallationPlanDatabase } from '../database/types/databaseTypes.ts'

type AnalysisLike = {
  sourceUrl: string
  projectName: string
  primaryLanguage: string
  projectType: string
  technologies: string[]
  framework: string
  buildTool: string
  packageManager: string
  hasFrontend: boolean
  hasBackend: boolean
  databaseRequired: boolean
  databaseDetail: string
  dependencies: string[]
  installCommands: string[]
  buildCommands: string[]
  devCommands: string[]
  runCommands: string[]
  analyzedAt: string
  directoryStructure?: string[]
}

export type InstallationPlanPayload = {
  source: 'local-service'
  generatedAt: string
  basedOnAnalysisAt: string
  projectName: string
  sourceUrl: string
  plannedInstallDirectory: string
  primaryLanguage: string
  framework: string
  packageManager: string
  technologySummary: string
  systemDependencies: string[]
  projectDependencies: string[]
  installCommands: string[]
  buildCommand: string | null
  startCommand: string | null
  devCommand: string | null
  identifiedPorts: number[]
  databaseRequired: boolean
  databaseType: string
  environmentVariables: string[]
  configurationFiles: string[]
  prerequisites: string[]
  warnings: string[]
  risks: string[]
  confidenceLevel: 'baixa' | 'media' | 'alta'
  plannedSteps: { order: number; title: string; description: string }[]
  disclaimer: string
  database: InstallationPlanDatabase
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'projeto'
}

function inferSystemDependencies(analysis: AnalysisLike): string[] {
  const deps = new Set<string>(['Git (para obter/atualizar código)'])

  if (analysis.installCommands.some((cmd) => cmd.startsWith('npm') || cmd.includes('pnpm') || cmd.includes('yarn'))) {
    deps.add('Node.js')
  }
  if (analysis.primaryLanguage === 'Python' || analysis.installCommands.some((cmd) => cmd.startsWith('pip'))) {
    deps.add('Python')
  }
  if (analysis.packageManager === 'cargo') deps.add('Rust (Cargo)')
  if (analysis.packageManager === 'composer') deps.add('PHP + Composer')

  return [...deps]
}

function buildTechnologySummary(analysis: AnalysisLike): string {
  const parts = [analysis.framework, analysis.primaryLanguage, analysis.buildTool].filter(
    (part) => part && part !== 'Não identificado',
  )
  return parts.length > 0 ? parts.join(' + ') : analysis.projectType
}

function computeConfidence(analysis: AnalysisLike): 'baixa' | 'media' | 'alta' {
  let score = 0
  if (analysis.installCommands.length > 0) score += 1
  if (analysis.buildCommands.length > 0) score += 1
  if (analysis.runCommands.length > 0 || analysis.devCommands.length > 0) score += 1
  if (analysis.framework !== 'Não identificado') score += 1
  if (score >= 3) return 'alta'
  if (score >= 2) return 'media'
  return 'baixa'
}

function buildSteps(analysis: AnalysisLike): InstallationPlanPayload['plannedSteps'] {
  const steps: InstallationPlanPayload['plannedSteps'] = [
    {
      order: 1,
      title: 'Preparar diretório do sistema',
      description: 'Reservar pasta dedicada para o código e artefatos deste sistema no computador servidor.',
    },
    {
      order: 2,
      title: 'Obter código-fonte',
      description: 'Clonar ou copiar o projeto a partir da URL cadastrada para o diretório planejado.',
    },
  ]

  if (analysis.installCommands.length > 0) {
    steps.push({
      order: steps.length + 1,
      title: 'Instalar dependências do projeto',
      description: `Executar: ${analysis.installCommands.join(' · ')}`,
    })
  }

  if (analysis.buildCommands.length > 0) {
    steps.push({
      order: steps.length + 1,
      title: 'Gerar build de produção',
      description: `Executar: ${analysis.buildCommands.join(' · ')}`,
    })
  }

  if (analysis.databaseRequired) {
    steps.push({
      order: steps.length + 1,
      title: 'Preparar banco de dados',
      description: `Configurar ${analysis.databaseDetail} conforme variáveis e scripts do projeto.`,
    })
  }

  steps.push({
    order: steps.length + 1,
    title: 'Configurar variáveis e arquivos',
    description: 'Aplicar variáveis de ambiente e arquivos de configuração identificados na análise.',
  })

  steps.push({
    order: steps.length + 1,
    title: 'Preparar serviço de execução',
    description: 'Definir porta, processo de inicialização e monitoramento local do sistema.',
  })

  const start = analysis.runCommands[0] ?? analysis.devCommands[0]
  steps.push({
    order: steps.length + 1,
    title: 'Iniciar aplicação',
    description: start
      ? `Executar: ${start}`
      : 'Comando de inicialização não identificado — exige validação manual antes da execução.',
  })

  return steps
}

export function buildInstallationPlan(
  analysis: AnalysisLike,
  hints: PlanHints,
  systemId?: string,
): InstallationPlanPayload {
  const slug = slugify(analysis.projectName)
  const warnings: string[] = []
  const risks: string[] = []

  if (analysis.hasFrontend && !analysis.hasBackend) {
    warnings.push('Frontend identificado, mas nenhum backend foi detectado na análise.')
  }
  if (!analysis.buildCommands.length && analysis.hasFrontend) {
    warnings.push('Nenhum script de build foi identificado no projeto.')
  }
  if (!analysis.runCommands.length && !analysis.devCommands.length) {
    warnings.push('Comando de execução não identificado — pode exigir configuração manual.')
  }
  if (hints.environmentVariables.length === 0) {
    warnings.push('Variáveis de ambiente não puderam ser inferidas completamente nesta etapa.')
  }

  risks.push('Execução futura do plano alterará o computador servidor — somente após confirmação explícita.')
  if (analysis.databaseRequired) {
    risks.push('Configuração de banco de dados exigirá credenciais e backups adequados.')
  }

  const startCommand = analysis.runCommands[0] ?? null
  const devCommand = analysis.devCommands[0] ?? null
  const buildCommand = analysis.buildCommands[0] ?? null

  const database = buildPlanDatabaseSection({
    dependencies: analysis.dependencies,
    environmentVariableNames: hints.environmentVariables,
    configurationFiles: hints.configurationFiles,
    directoryEntries: analysis.directoryStructure ?? [],
    legacyDatabaseRequired: analysis.databaseRequired,
    legacyDatabaseDetail: analysis.databaseDetail,
  })

  return {
    source: 'local-service',
    generatedAt: new Date().toISOString(),
    basedOnAnalysisAt: analysis.analyzedAt,
    projectName: analysis.projectName,
    sourceUrl: analysis.sourceUrl,
    plannedInstallDirectory: path.join(getSystemsRoot(), systemId ?? slug),
    primaryLanguage: analysis.primaryLanguage,
    framework: analysis.framework,
    packageManager: analysis.packageManager,
    technologySummary: buildTechnologySummary(analysis),
    systemDependencies: inferSystemDependencies(analysis),
    projectDependencies: analysis.dependencies,
    installCommands: analysis.installCommands,
    buildCommand,
    startCommand,
    devCommand,
    identifiedPorts: hints.identifiedPorts,
    databaseRequired: database.required,
    databaseType: database.engine === 'none' ? 'Não identificado' : database.engineLabel,
    database,
    environmentVariables: hints.environmentVariables,
    configurationFiles: hints.configurationFiles,
    prerequisites: inferSystemDependencies(analysis),
    warnings,
    risks,
    confidenceLevel: computeConfidence(analysis),
    plannedSteps: buildSteps(analysis),
    disclaimer:
      'Este é apenas um plano. Nenhuma alteração foi realizada no computador. Nenhum comando foi executado.',
  }
}
