import fs from 'node:fs/promises'
import path from 'node:path'
import Ajv2020Module from 'ajv/dist/2020.js'
import { runControlledCommand } from '../installation/runControlledCommand.ts'
import { runManifestScript, resolveScriptPath } from './scriptRunner.ts'
import {
  KNOWN_CAPABILITIES,
  SERVER_MANIFEST_SCHEMA_RELATIVE,
  SUPPORTED_BACKEND_PROFILE,
  VALIDATE_MANIFEST_SCRIPT_ID,
  type ManifestPhase,
  type ManifestValidationResult,
  type ServerManifest,
} from './types.ts'

/** ajv é CJS: o construtor pode vir em `.default` conforme o runtime (Node ESM vs bundle). */
const Ajv2020 = ((Ajv2020Module as unknown as { default?: typeof Ajv2020Module }).default ??
  Ajv2020Module) as typeof Ajv2020Module

const VALID_PLATFORMS = new Set(['windows', 'linux'])

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

/** Etapa 3 — valida o manifesto contra o JSON Schema do próprio clone. */
async function validateAgainstSchema(
  rootDirectory: string,
  manifest: ServerManifest,
  errors: string[],
): Promise<boolean> {
  const schemaPath = path.join(rootDirectory, ...SERVER_MANIFEST_SCHEMA_RELATIVE.split('/'))

  let schema: object
  try {
    schema = JSON.parse(await fs.readFile(schemaPath, 'utf8')) as object
  } catch {
    errors.push(`Schema não encontrado ou inválido no clone: ${SERVER_MANIFEST_SCHEMA_RELATIVE}`)
    return false
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false })
  let validate: ReturnType<typeof ajv.compile>
  try {
    validate = ajv.compile(schema)
  } catch (error) {
    errors.push(
      `Schema do manifesto não pôde ser compilado: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
    )
    return false
  }

  if (!validate(manifest)) {
    for (const item of validate.errors ?? []) {
      errors.push(`Schema: ${item.instancePath || '/'} ${item.message ?? 'inválido'}`)
    }
  }
  return true
}

/**
 * `validate-server-manifest` delega a `schemas/validate-manifest.mjs`, que importa `ajv`
 * de `schemas/node_modules`. Instala só essas dependências (sem scripts de postinstall).
 */
async function ensureSchemasDependencies(
  rootDirectory: string,
): Promise<{ ok: true } | { ok: false; output: string }> {
  const schemasDirectory = path.join(rootDirectory, 'schemas')
  if (!(await fileExists(path.join(schemasDirectory, 'package.json')))) return { ok: true }
  if (await fileExists(path.join(schemasDirectory, 'node_modules', 'ajv', 'package.json'))) return { ok: true }

  const hasLock = await fileExists(path.join(schemasDirectory, 'package-lock.json'))
  const run = await runControlledCommand(
    {
      executable: 'npm',
      args: [hasLock ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
      label: `npm ${hasLock ? 'ci' : 'install'} (schemas)`,
    },
    schemasDirectory,
  )
  return run.ok ? { ok: true } : { ok: false, output: run.output }
}

function detectDependencyCycle(phases: ManifestPhase[]): string | null {
  const byId = new Map(phases.map((phase) => [phase.id, phase]))
  const state = new Map<string, 'visiting' | 'done'>()

  function visit(id: string, trail: string[]): string | null {
    if (state.get(id) === 'done') return null
    if (state.get(id) === 'visiting') return [...trail, id].join(' → ')
    state.set(id, 'visiting')
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep)) continue
      const cycle = visit(dep, [...trail, id])
      if (cycle) return cycle
    }
    state.set(id, 'done')
    return null
  }

  for (const phase of phases) {
    const cycle = visit(phase.id, [])
    if (cycle) return cycle
  }
  return null
}

/** Etapas 3–4: schema + semântica + script `validate-server-manifest`. */
export async function validateServerManifest(input: {
  rootDirectory: string
  manifest: ServerManifest
  /** Executa o script do repositório (etapa 4). Desligue só em testes. */
  runValidationScript?: boolean
}): Promise<ManifestValidationResult> {
  const { rootDirectory, manifest } = input
  const errors: string[] = []
  const warnings: string[] = []

  const schemaChecked = await validateAgainstSchema(rootDirectory, manifest, errors)

  if (manifest.manager?.backendProfile !== SUPPORTED_BACKEND_PROFILE) {
    errors.push(
      `Perfil de backend não suportado: "${manifest.manager?.backendProfile ?? 'ausente'}" (esperado ${SUPPORTED_BACKEND_PROFILE}).`,
    )
  }
  if (manifest.installPlan?.profile && manifest.installPlan.profile !== manifest.manager?.backendProfile) {
    errors.push('installPlan.profile difere de manager.backendProfile.')
  }

  const scriptItems = manifest.scripts?.items ?? []
  const scriptsById = new Map(scriptItems.map((item) => [item.id, item]))
  if (scriptsById.size !== scriptItems.length) {
    errors.push('scripts.items contém ids duplicados.')
  }

  for (const item of scriptItems) {
    try {
      const resolved = resolveScriptPath(rootDirectory, item)
      if (!(await fileExists(resolved))) {
        errors.push(`Script "${item.id}" não existe no clone: ${item.path}`)
      }
    } catch {
      errors.push(`Script "${item.id}" aponta para fora do repositório.`)
    }
  }

  const phases = manifest.installPlan?.phases ?? []
  const phaseIds = new Set<string>()
  for (const phase of phases) {
    if (phaseIds.has(phase.id)) errors.push(`Fase duplicada: ${phase.id}`)
    phaseIds.add(phase.id)
  }

  for (const phase of phases) {
    for (const dep of phase.dependsOn ?? []) {
      if (!phaseIds.has(dep)) errors.push(`Fase "${phase.id}" depende de fase inexistente: ${dep}`)
    }

    for (const platform of phase.platforms ?? []) {
      if (!VALID_PLATFORMS.has(platform)) {
        errors.push(`Fase "${phase.id}" usa plataforma desconhecida: ${platform}`)
      }
    }

    if (phase.type === 'capability') {
      if (!phase.capability) {
        errors.push(`Fase "${phase.id}" (capability) sem campo "capability".`)
      } else if (!(KNOWN_CAPABILITIES as readonly string[]).includes(phase.capability)) {
        errors.push(`Fase "${phase.id}" usa capability desconhecida: ${phase.capability}`)
      }
    } else if (phase.type === 'script') {
      const refs = [
        ...(phase.scriptId ? [phase.scriptId] : []),
        ...Object.values(phase.scriptIdByPlatform ?? {}),
      ]
      if (refs.length === 0) {
        errors.push(`Fase "${phase.id}" (script) sem scriptId nem scriptIdByPlatform.`)
      }
      for (const ref of refs) {
        if (!scriptsById.has(ref)) {
          errors.push(`Fase "${phase.id}" referencia scriptId inexistente: ${ref}`)
        }
      }
    } else {
      errors.push(`Fase "${phase.id}" com type inválido.`)
    }
  }

  const cycle = detectDependencyCycle(phases)
  if (cycle) errors.push(`Ciclo em dependsOn: ${cycle}`)

  for (const test of manifest.validation?.postInstall?.tests ?? []) {
    if (!scriptsById.has(test.scriptId)) {
      errors.push(`validation.postInstall.tests "${test.id}" referencia scriptId inexistente: ${test.scriptId}`)
    }
  }

  const validateScript = scriptsById.get(VALIDATE_MANIFEST_SCRIPT_ID)
  let scriptChecked = false
  if (!validateScript) {
    warnings.push(`Script "${VALIDATE_MANIFEST_SCRIPT_ID}" não está declarado no manifesto.`)
  } else if (input.runValidationScript !== false) {
    scriptChecked = true
    const deps = await ensureSchemasDependencies(rootDirectory)
    if (!deps.ok) {
      errors.push(`Dependências do validador (schemas/) não instaladas: ${deps.output.slice(0, 800)}`)
      return { ok: false, errors, warnings, schemaChecked, scriptChecked }
    }
    try {
      const run = await runManifestScript({
        rootDirectory,
        script: validateScript,
        timeoutMs: 60_000,
      })
      if (!run.ok) {
        errors.push(
          `Script ${VALIDATE_MANIFEST_SCRIPT_ID} falhou (código ${run.exitCode ?? '?'}): ${run.output.slice(0, 1200)}`,
        )
      }
    } catch (error) {
      errors.push(
        `Script ${VALIDATE_MANIFEST_SCRIPT_ID} não pôde ser executado: ${error instanceof Error ? error.message : 'erro'}`,
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings, schemaChecked, scriptChecked }
}
