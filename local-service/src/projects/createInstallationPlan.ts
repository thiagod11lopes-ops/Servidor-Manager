import { collectPlanHintsFromAnalysis } from '../analysis/collectPlanHints.ts'
import { buildInstallationPlan } from '../plan/buildInstallationPlan.ts'
import {
  buildManifestInstallationPlan,
  isManifestSummary,
} from '../serverManifest/buildManifestInstallationPlan.ts'
import {
  encodeLocalFolderSourceUrl,
  isLocalFolderSourceUrl,
  localProjectFolderErrorMessage,
  normalizeLocalFolderPath,
  parseLocalFolderSourceUrl,
  validateLocalProjectFolder,
} from '../sources/localFolderSource.ts'
import { normalizeGitRemoteUrl, validateSourceUrl } from '../sources/validateSourceUrl.ts'
type CachedAnalysis = {
  mock?: boolean
  source?: string
  sourceUrl?: string
  projectName?: string
  primaryLanguage?: string
  projectType?: string
  technologies?: string[]
  framework?: string
  buildTool?: string
  packageManager?: string
  hasFrontend?: boolean
  hasBackend?: boolean
  databaseRequired?: boolean
  databaseDetail?: string
  dependencies?: string[]
  installCommands?: string[]
  buildCommands?: string[]
  devCommands?: string[]
  runCommands?: string[]
  directoryStructure?: string[]
  analyzedAt?: string
  /** Presente quando o repositório tem server-manifest.json (perfil supabase-local-v1). */
  serverManifest?: unknown
  sourceKind?: 'git' | 'localFolder'
  localFolderPath?: string
}

function errorMessage(code: string): string {
  switch (code) {
    case 'INVALID_SOURCE_URL':
      return 'Informe uma URL pública válida para gerar o plano de instalação.'
    case 'ANALYSIS_REQUIRED':
      return 'É necessária uma análise REAL do projeto antes de gerar o plano.'
    case 'GIT_NOT_AVAILABLE':
      return 'Git não está disponível neste computador.'
    case 'GIT_CLONE_FAILED':
      return 'Não foi possível obter o código para complementar o plano de instalação.'
    default:
      return 'Não foi possível gerar o plano de instalação neste momento.'
  }
}

function isCachedRealAnalysis(
  analysis: CachedAnalysis,
  sourceRef: { sourceUrl: string; localFolderPath?: string },
): analysis is Required<
  Pick<
    CachedAnalysis,
    | 'projectName'
    | 'sourceUrl'
    | 'primaryLanguage'
    | 'projectType'
    | 'technologies'
    | 'framework'
    | 'buildTool'
    | 'packageManager'
    | 'hasFrontend'
    | 'hasBackend'
    | 'databaseRequired'
    | 'databaseDetail'
    | 'dependencies'
    | 'installCommands'
    | 'buildCommands'
    | 'devCommands'
    | 'runCommands'
    | 'directoryStructure'
    | 'analyzedAt'
  >
> {
  if (analysis.mock === true || analysis.source !== 'local-service') return false
  if (!analysis.analyzedAt || !analysis.projectName) return false

  const localPath =
    sourceRef.localFolderPath?.trim() ||
    parseLocalFolderSourceUrl(sourceRef.sourceUrl) ||
    analysis.localFolderPath?.trim() ||
    parseLocalFolderSourceUrl(analysis.sourceUrl ?? '')

  if (localPath || analysis.sourceKind === 'localFolder' || isLocalFolderSourceUrl(sourceRef.sourceUrl)) {
    if (!localPath) return false
    const expected = normalizeLocalFolderPath(localPath)
    const actualRaw =
      analysis.localFolderPath?.trim() ||
      parseLocalFolderSourceUrl(analysis.sourceUrl ?? '') ||
      analysis.sourceUrl
    if (!actualRaw) return false
    const actual = normalizeLocalFolderPath(actualRaw)
    return expected === actual
  }

  try {
    const expected = normalizeGitRemoteUrl(validateSourceUrl(sourceRef.sourceUrl))
    const actual = normalizeGitRemoteUrl(validateSourceUrl(analysis.sourceUrl ?? ''))
    return expected === actual
  } catch {
    return false
  }
}

export async function createInstallationPlan(
  sourceUrl: string,
  cachedAnalysis?: CachedAnalysis,
  systemId?: string,
  localFolderPath?: string,
) {
  const explicitLocal = typeof localFolderPath === 'string' ? localFolderPath.trim() : ''
  const parsedLocal = explicitLocal || parseLocalFolderSourceUrl(sourceUrl) || ''

  if (parsedLocal) {
    const validated = await validateLocalProjectFolder(parsedLocal)
    if (!validated.ok) {
      return { ok: false as const, message: localProjectFolderErrorMessage(validated.code) }
    }
  } else {
    try {
      validateSourceUrl(sourceUrl)
    } catch {
      return { ok: false as const, message: errorMessage('INVALID_SOURCE_URL') }
    }
  }

  const planSourceUrl = parsedLocal ? encodeLocalFolderSourceUrl(parsedLocal) : sourceUrl
  const sourceRef = { sourceUrl: planSourceUrl, localFolderPath: parsedLocal || undefined }

  const manifestSummary = cachedAnalysis?.serverManifest

  if (cachedAnalysis && isCachedRealAnalysis(cachedAnalysis, sourceRef)) {
    // Etapa 46: manifesto presente → plano = installPlan do manifesto (não npm preview).
    if (isManifestSummary(manifestSummary)) {
      const plan = buildManifestInstallationPlan({
        summary: manifestSummary,
        sourceUrl: planSourceUrl,
        analyzedAt: cachedAnalysis.analyzedAt,
        systemId,
      })
      return { ok: true as const, plan }
    }

    const hints = collectPlanHintsFromAnalysis({
      directoryStructure: cachedAnalysis.directoryStructure,
      buildTool: cachedAnalysis.buildTool,
      framework: cachedAnalysis.framework,
      hasBackend: cachedAnalysis.hasBackend,
    })

    const plan = buildInstallationPlan(
      {
        sourceUrl: cachedAnalysis.sourceUrl,
        projectName: cachedAnalysis.projectName,
        primaryLanguage: cachedAnalysis.primaryLanguage,
        projectType: cachedAnalysis.projectType,
        technologies: cachedAnalysis.technologies,
        framework: cachedAnalysis.framework,
        buildTool: cachedAnalysis.buildTool,
        packageManager: cachedAnalysis.packageManager,
        hasFrontend: cachedAnalysis.hasFrontend,
        hasBackend: cachedAnalysis.hasBackend,
        databaseRequired: cachedAnalysis.databaseRequired,
        databaseDetail: cachedAnalysis.databaseDetail,
        dependencies: cachedAnalysis.dependencies,
        installCommands: cachedAnalysis.installCommands,
        buildCommands: cachedAnalysis.buildCommands,
        devCommands: cachedAnalysis.devCommands,
        runCommands: cachedAnalysis.runCommands,
        analyzedAt: cachedAnalysis.analyzedAt,
        directoryStructure: cachedAnalysis.directoryStructure,
      },
      hints,
      systemId,
    )

    return { ok: true as const, plan }
  }

  return { ok: false as const, message: errorMessage('ANALYSIS_REQUIRED') }
}
