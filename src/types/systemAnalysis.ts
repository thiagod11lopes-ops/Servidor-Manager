export type SystemAnalysisSource = 'local-service' | 'mock'

export type SystemAnalysisResult = {
  source: SystemAnalysisSource
  mock: boolean
  sourceUrl: string
  sourceKind?: 'git' | 'localFolder'
  localFolderPath?: string
  projectName: string
  primaryLanguage: string
  projectType: string
  technologies: string[]
  hasPackageJson: boolean
  framework: string
  buildTool: string
  packageManager: string
  hasFrontend: boolean
  hasBackend: boolean
  backendRequired: boolean
  backendDetail: string
  databaseRequired: boolean
  databaseDetail: string
  dependencies: string[]
  installCommands: string[]
  buildCommands: string[]
  devCommands: string[]
  runCommands: string[]
  directoryStructure: string[]
  analyzedAt: string
  disclaimer: string
  /** Presente quando o repositório traz server-manifest.json (supabase-local-v1). */
  serverManifest?: ServerManifestSummary
}

export type ServerManifestPhaseSummary = {
  order: number
  id: string
  description: string
  status: 'run' | 'skip' | 'blocked'
  reason?: string
  note?: string
  optional: boolean
  requiresElevation: boolean
}

export type ServerManifestSummary = {
  manifestVersion: string
  backendProfile: string
  systemId: string
  productDisplayName: string
  cloneUrl: string
  gitRef: string | null
  platform: 'windows' | 'linux' | 'unsupported'
  validation: {
    ok: boolean
    errors: string[]
    warnings: string[]
    schemaChecked: boolean
    scriptChecked: boolean
  }
  phases: ServerManifestPhaseSummary[]
  validationTests: Array<{ id: string; scriptId: string; requiredForInstall: boolean }>
  requiredTools: string[]
  environmentKeys: string[]
  httpPort: number
  prerequisites?:
    | { ok: true; platform: 'windows' | 'linux'; checked: string[] }
    | {
        ok: false
        platform: 'windows' | 'linux' | null
        missing: Array<{ tool: string; reason: string; step: string }>
      }
}

export type SystemAnalysisResponse =
  | { ok: true; result: SystemAnalysisResult }
  | { ok: false; message: string }
