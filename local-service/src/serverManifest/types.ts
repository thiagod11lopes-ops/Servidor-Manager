/** Perfil de backend suportado pelo Manager para AcompOPMS (Supabase local + Caddy). */
export const SUPPORTED_BACKEND_PROFILE = 'supabase-local-v1'

export const SERVER_MANIFEST_FILE = 'server-manifest.json'
export const SERVER_MANIFEST_SCHEMA_RELATIVE = 'schemas/server-manifest.schema.json'

/** Script de validação referenciado em `scripts.items[]` do manifesto. */
export const VALIDATE_MANIFEST_SCRIPT_ID = 'validate-server-manifest'

export type ManifestPlatform = 'windows' | 'linux'

export type ManifestScriptItem = {
  id: string
  path: string
  platforms?: string[]
  interpreter?: string
  requiresElevation?: boolean
  purpose?: string
}

export type ManifestPhase = {
  id: string
  type: 'script' | 'capability'
  description?: string
  scriptId?: string
  scriptIdByPlatform?: Partial<Record<ManifestPlatform, string>>
  capability?: string
  platforms?: string[]
  dependsOn?: string[]
  optional?: boolean
  checkpoint?: boolean
  requiresServiceStopBefore?: string[]
  requiresServiceRestart?: string[]
}

export type ServerManifest = {
  manifestVersion: string
  schemaVersion?: string
  manager: {
    minManagerVersion?: string
    supportedPlatforms?: string[]
    backendProfile: string
    manifestPath?: string
  }
  repository: {
    name?: string
    cloneUrl?: string
    defaultBranch?: string
    productDisplayName?: string
    productDescription?: string
  }
  system: { id?: string; name?: string; version?: string }
  scripts: { items: ManifestScriptItem[] }
  installPlan: {
    profile?: string
    phases: ManifestPhase[]
  }
  validation?: {
    postInstall?: {
      tests?: Array<{ id: string; scriptId: string; requiredForInstall?: boolean; context?: string }>
    }
  }
  requirements?: Record<string, unknown>
  configuration?: {
    environmentKeys?: string[]
    singleSourceOfTruthRelativePath?: string
  }
  update?: { phases?: string[] }
  [key: string]: unknown
}

/** Capabilities que o Manager sabe implementar (handlers entram nos itens 3+). */
export const KNOWN_CAPABILITIES = ['supabase.ensure-started', 'supabase.restart'] as const
export type KnownCapability = (typeof KNOWN_CAPABILITIES)[number]

export type LoadedServerManifest = {
  manifest: ServerManifest
  manifestPath: string
  rootDirectory: string
}

export type LoadServerManifestResult =
  | { found: false }
  | { found: true; ok: false; manifestPath: string; error: string }
  | ({ found: true; ok: true } & LoadedServerManifest)

export type ManifestValidationResult = {
  ok: boolean
  errors: string[]
  warnings: string[]
  schemaChecked: boolean
  scriptChecked: boolean
}

export type PhaseResolution =
  | { kind: 'script'; script: ManifestScriptItem }
  | { kind: 'capability'; capability: string }

export type PlannedPhaseStatus = 'run' | 'skip' | 'blocked'

export type PlannedPhase = {
  order: number
  phase: ManifestPhase
  status: PlannedPhaseStatus
  /** Motivo de skip/blocked (para UI e logs). */
  reason?: string
  /** Aviso informativo em fases que rodam (ex.: exige bash no Windows). */
  note?: string
  resolution?: PhaseResolution
  requiresElevation: boolean
}

export type PhaseExecutionPlan = {
  platform: ManifestPlatform
  overlayEnabled: boolean
  phases: PlannedPhase[]
}

export type ServerManifestSummary = {
  manifestVersion: string
  backendProfile: string
  systemId: string
  productDisplayName: string
  cloneUrl: string
  gitRef: string | null
  platform: ManifestPlatform | 'unsupported'
  validation: ManifestValidationResult
  phases: Array<{
    order: number
    id: string
    description: string
    status: PlannedPhaseStatus
    reason?: string
    note?: string
    optional: boolean
    requiresElevation: boolean
  }>
  validationTests: Array<{ id: string; scriptId: string; requiredForInstall: boolean }>
  /** Ferramentas com `required: true` em `requirements` (git, node, docker, ...). */
  requiredTools: string[]
  environmentKeys: string[]
  /** Porta HTTP LAN (Caddy), default do manifesto (8080). */
  httpPort: number
}
