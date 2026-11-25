import { buildPhaseExecutionPlan, detectManifestPlatform } from './buildPhaseExecutionPlan.ts'
import { loadServerManifest } from './loadServerManifest.ts'
import { validateServerManifest } from './validateServerManifest.ts'
import type {
  LoadedServerManifest,
  ManifestValidationResult,
  PhaseExecutionPlan,
  ServerManifest,
  ServerManifestSummary,
} from './types.ts'

export function buildManifestSummary(input: {
  loaded: LoadedServerManifest
  validation: ManifestValidationResult
  plan: PhaseExecutionPlan | null
  gitRef: string | null
}): ServerManifestSummary {
  const { manifest } = input.loaded
  return {
    manifestVersion: manifest.manifestVersion,
    backendProfile: manifest.manager?.backendProfile ?? '',
    systemId: manifest.system?.id ?? '',
    productDisplayName: manifest.repository?.productDisplayName ?? manifest.system?.name ?? 'Sistema',
    cloneUrl: manifest.repository?.cloneUrl ?? '',
    gitRef: input.gitRef,
    platform: input.plan?.platform ?? 'unsupported',
    validation: input.validation,
    phases: (input.plan?.phases ?? []).map((item) => ({
      order: item.order,
      id: item.phase.id,
      description: item.phase.description ?? item.phase.id,
      status: item.status,
      reason: item.reason,
      note: item.note,
      optional: item.phase.optional === true,
      requiresElevation: item.requiresElevation,
    })),
    validationTests: (manifest.validation?.postInstall?.tests ?? []).map((test) => ({
      id: test.id,
      scriptId: test.scriptId,
      requiredForInstall: test.requiredForInstall === true,
    })),
    requiredTools: Object.entries(manifest.requirements ?? {})
      .filter(([, value]) => Boolean(value) && typeof value === 'object' && (value as { required?: unknown }).required === true)
      .map(([name]) => name),
    environmentKeys: manifest.configuration?.environmentKeys ?? [],
    httpPort: readHttpPort(manifest),
  }
}

function readHttpPort(manifest: ServerManifest): number {
  const lan = (manifest.clientConnection as { lan?: { variables?: { httpPort?: { default?: unknown } } } } | undefined)?.lan
  const value = lan?.variables?.httpPort?.default
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 65536 ? value : 8080
}

export type InspectManifestResult =
  | { found: false }
  | {
      found: true
      loaded: LoadedServerManifest | null
      loadError?: string
      validation: ManifestValidationResult | null
      plan: PhaseExecutionPlan | null
      summary: ServerManifestSummary | null
    }

/**
 * Detecta, valida e monta o plano de fases de um clone (etapas 2–5).
 * `runValidationScript` executa `validate-server-manifest` (código do repositório) — só use no clone real de instalação ou análise controlada.
 */
export async function inspectServerManifest(input: {
  rootDirectory: string
  gitRef: string | null
  overlayEnabled?: boolean
  runValidationScript?: boolean
}): Promise<InspectManifestResult> {
  const loadedResult = await loadServerManifest(input.rootDirectory)
  if (!loadedResult.found) return { found: false }

  if (!loadedResult.ok) {
    return {
      found: true,
      loaded: null,
      loadError: loadedResult.error,
      validation: null,
      plan: null,
      summary: null,
    }
  }

  const loaded: LoadedServerManifest = {
    manifest: loadedResult.manifest,
    manifestPath: loadedResult.manifestPath,
    rootDirectory: loadedResult.rootDirectory,
  }

  const validation = await validateServerManifest({
    rootDirectory: input.rootDirectory,
    manifest: loaded.manifest,
    runValidationScript: input.runValidationScript,
  })

  const platform = detectManifestPlatform()
  const plan = platform
    ? buildPhaseExecutionPlan(loaded.manifest, { platform, overlayEnabled: input.overlayEnabled })
    : null

  return {
    found: true,
    loaded,
    validation,
    plan,
    summary: buildManifestSummary({ loaded, validation, plan, gitRef: input.gitRef }),
  }
}
