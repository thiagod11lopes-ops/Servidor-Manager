import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { promisify } from 'node:util'
import { getManifestPath, getServerManifestStatePath } from '../installation/paths.ts'
import { isManifestLanInstallation, readInstallationManifest } from '../runtime/installationManifest.ts'
import { stopManifestLanStack } from '../runtime/manifestLanRuntime.ts'
import { createManifestPhaseHandlers } from './createManifestPhaseHandlers.ts'
import { executePhasePlan } from './executePhasePlan.ts'
import { fetchServerConnectionJson, resolveLanHttpOrigin } from './fetchServerConnection.ts'
import { loadServidorEnvIntoProcessEnv } from './loadServidorEnvIntoProcessEnv.ts'
import { readSystemAccessModeConfig } from '../config/systemAccessMode.ts'
import { buildUpdatePrepareServidorEnvInput } from './maintenancePrepareServidorEnv.ts'
import { prepareServidorEnv, resolveServidorEnvPaths } from './prepareServidorEnv.ts'
import { readServerManifestState } from './readServerManifestState.ts'
import { runManifestScript } from './scriptRunner.ts'
import { runRequiredPostInstallTests } from './runManifestValidationTests.ts'
import { inspectServerManifest } from './summarizeServerManifest.ts'
import { SUPPORTED_BACKEND_PROFILE, type ManifestScriptItem, type ServerManifest } from './types.ts'

const execFileAsync = promisify(execFile)
const SCRIPT_TIMEOUT_MS = 900_000

export type ManifestMaintenanceResult =
  | { ok: true; message: string; output?: string; loginUrl?: string }
  | { ok: false; message: string; output?: string }

function scriptById(manifest: ServerManifest, id: string): ManifestScriptItem | null {
  return manifest.scripts?.items?.find((item) => item.id === id) ?? null
}

function resolveBackupScript(manifest: ServerManifest): ManifestScriptItem | null {
  const backup = manifest.backup as { backupScriptId?: string } | undefined
  const id = backup?.backupScriptId ?? 'backup-local-database'
  return scriptById(manifest, id)
}

async function gitPullFfOnly(cwd: string): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', ['pull', '--ff-only'], {
      cwd,
      windowsHide: true,
      timeout: 600_000,
      maxBuffer: 4 * 1024 * 1024,
    })
    return { ok: true, output: `${stdout}\n${stderr}`.trim() }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    return {
      ok: false,
      output: `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? ''}`.trim(),
    }
  }
}

async function readOverlayEnabledFromEnv(rootDirectory: string, manifest: ServerManifest): Promise<boolean> {
  const paths = resolveServidorEnvPaths(rootDirectory, manifest)
  try {
    const raw = await fs.readFile(paths.envPath, 'utf8')
    const match = /^ACOMOPMS_OVERLAY_ENABLED=(.+)$/m.exec(raw)
    return match ? match[1].trim().toLowerCase() === 'true' : false
  } catch {
    return false
  }
}

async function loadManifestContext(systemId: string) {
  const installation = await readInstallationManifest(systemId)
  if (!installation || !isManifestLanInstallation(installation)) {
    return { error: 'Sistema não é instalação manifest (supabase-local-v1).' as const }
  }

  const rootDirectory = installation.projectDirectory
  try {
    await fs.access(rootDirectory)
  } catch {
    return { error: 'Clone do projeto não encontrado no disco.' as const }
  }

  const inspected = await inspectServerManifest({
    rootDirectory,
    gitRef: null,
    runValidationScript: false,
  })

  if (!inspected.found || !inspected.loaded || !inspected.plan || !inspected.summary) {
    return { error: 'server-manifest.json indisponível ou inválido no clone.' as const }
  }

  return { installation, rootDirectory, inspected }
}

export async function runManifestDatabaseBackup(systemId: string): Promise<ManifestMaintenanceResult> {
  const ctx = await loadManifestContext(systemId)
  if ('error' in ctx) return { ok: false, message: ctx.error }

  const script = resolveBackupScript(ctx.inspected.loaded.manifest)
  if (!script) {
    return { ok: false, message: 'Script de backup não encontrado no server-manifest.' }
  }

  const env = await loadServidorEnvIntoProcessEnv(ctx.rootDirectory, ctx.inspected.loaded.manifest)
  const run = await runManifestScript({
    rootDirectory: ctx.rootDirectory,
    script,
    env,
    timeoutMs: SCRIPT_TIMEOUT_MS,
  })

  if (!run.ok) {
    return {
      ok: false,
      message: `Backup falhou (${script.id}).`,
      output: run.output.slice(0, 8000),
    }
  }

  const backupDir =
    (ctx.inspected.loaded.manifest.backup as { defaultOutputDirectoryRelativePath?: string } | undefined)
      ?.defaultOutputDirectoryRelativePath ?? 'Transferir para Servidor/servidor-lan/backups'

  return {
    ok: true,
    message: `Backup concluído (${script.id}). Saída padrão: ${backupDir}`,
    output: run.output.slice(0, 4000),
  }
}

function collectCompletedScriptIds(
  execution: Awaited<ReturnType<typeof executePhasePlan>>,
): Set<string> {
  const ids = new Set<string>()
  for (const outcome of execution.outcomes) {
    if (outcome.status === 'ok' && outcome.phaseId === 'validation.post-install') {
      ids.add('test-server-lan')
    }
  }
  return ids
}

export async function runManifestSystemUpdate(
  systemId: string,
  options: { skipBackup?: boolean } = {},
): Promise<ManifestMaintenanceResult> {
  const ctx = await loadManifestContext(systemId)
  if ('error' in ctx) return { ok: false, message: ctx.error }

  const messages: string[] = []
  const append = (line: string) => {
    messages.push(line)
  }

  append('Atualização manifest: parando Caddy (proxy LAN)...')
  const stop = await stopManifestLanStack(systemId, ctx.installation)
  if (!stop.ok && stop.status?.caddyRunning) {
    return { ok: false, message: stop.message ?? 'Não foi possível parar o proxy antes da atualização.' }
  }

  if (!options.skipBackup) {
    append('Backup recomendado antes do git pull...')
    const backup = await runManifestDatabaseBackup(systemId)
    append(backup.ok ? backup.message : `Backup falhou (continuando): ${backup.message}`)
  } else {
    append('Backup ignorado (skipBackup=true).')
  }

  append('git pull --ff-only na raiz do clone...')
  const pull = await gitPullFfOnly(ctx.rootDirectory)
  if (!pull.ok) {
    return {
      ok: false,
      message: 'git pull falhou. Resolva conflitos manualmente no clone e tente novamente.',
      output: pull.output.slice(0, 4000),
    }
  }
  append(pull.output.split('\n')[0] ?? 'git pull OK.')

  const overlayEnabled = await readOverlayEnabledFromEnv(ctx.rootDirectory, ctx.inspected.loaded.manifest)
  const inspected = await inspectServerManifest({
    rootDirectory: ctx.rootDirectory,
    gitRef: null,
    overlayEnabled,
    runValidationScript: true,
  })

  if (!inspected.loaded || !inspected.plan || !inspected.summary || !inspected.validation?.ok) {
    return {
      ok: false,
      message: 'Manifesto inválido após git pull. Atualização abortada.',
      output: (inspected.validation?.errors ?? []).join('\n').slice(0, 2000),
    }
  }

  const envPaths = resolveServidorEnvPaths(ctx.rootDirectory, inspected.loaded.manifest)
  let existingEnvContent: string | null = null
  try {
    existingEnvContent = await fs.readFile(envPaths.envPath, 'utf8')
  } catch {
    existingEnvContent = null
  }

  const accessConfig = readSystemAccessModeConfig(systemId)
  const updateEnvInput = await buildUpdatePrepareServidorEnvInput({
    accessMode: accessConfig?.mode ?? null,
    existingEnvContent,
    manifestHttpPort: inspected.summary.httpPort,
  })
  if (!updateEnvInput.ok) {
    return { ok: false, message: updateEnvInput.message }
  }

  const envResult = await prepareServidorEnv({
    rootDirectory: ctx.rootDirectory,
    manifest: inspected.loaded.manifest,
    ...updateEnvInput.input,
  })
  if (!envResult.ok) {
    return { ok: false, message: envResult.message }
  }

  const { collectDiscoveredInstalledSystems } = await import('../systems/discoverInstalledSystems.ts')
  const { syncDatabaseNumberRegistry } = await import('../systems/databaseNumberRegistry.ts')
  const peerSystems = await collectDiscoveredInstalledSystems()
  const databaseAssignments = await syncDatabaseNumberRegistry(
    peerSystems.map((item) => ({ systemId: item.systemId, installedAt: item.installedAt })),
  )
  const databaseNumber = databaseAssignments[systemId] ?? null
  if (databaseNumber) {
    const { publishSystemDatabaseNumber } = await import('../systems/publishSystemDatabaseNumber.ts')
    await publishSystemDatabaseNumber({
      projectDirectory: ctx.rootDirectory,
      manifest: inspected.loaded.manifest,
      databaseNumber,
    })
  }

  const phaseCtx = {
    systemId,
    rootDirectory: ctx.rootDirectory,
    manifest: inspected.loaded.manifest,
    platform: inspected.plan.platform,
    log: async (line: string) => append(line),
  }
  const handlers = createManifestPhaseHandlers()

  append('Reexecutando fases pós-git (schema → build → Caddy → testes)...')
  const execution = await executePhasePlan(inspected.plan, phaseCtx, handlers, {
    executeOnlyAfterPhaseId: 'backend.ensure-started',
  })

  if (!execution.ok) {
    return {
      ok: false,
      message: `Atualização parou em ${execution.stoppedAt ?? 'fase desconhecida'}.`,
      output: messages.join('\n').slice(0, 6000),
    }
  }

  const validationTests = await runRequiredPostInstallTests({
    ctx: phaseCtx,
    manifest: inspected.loaded.manifest,
    completedScriptIds: collectCompletedScriptIds(execution),
  })

  if (!validationTests.ok) {
    return {
      ok: false,
      message: validationTests.outcomes.find((t) => !t.ok)?.message ?? 'Testes pós-atualização falharam.',
      output: messages.join('\n').slice(0, 6000),
    }
  }

  const origin = await resolveLanHttpOrigin({
    rootDirectory: ctx.rootDirectory,
    manifest: inspected.loaded.manifest,
    httpPort: envResult.httpPort,
  })
  if ('error' in origin) {
    return { ok: false, message: origin.error }
  }

  const connection = await fetchServerConnectionJson(origin.origin, envResult.httpPort)
  const loginUrl = connection.ok ? connection.loginUrl : undefined

  const priorState = await readServerManifestState(systemId)
  await fs.writeFile(
    getServerManifestStatePath(systemId),
    JSON.stringify(
      {
        profile: SUPPORTED_BACKEND_PROFILE,
        status: 'updated-lan',
        recordedAt: new Date().toISOString(),
        sourceUrl: priorState?.sourceUrl,
        rootDirectory: ctx.rootDirectory,
        summary: inspected.summary,
        servidorEnv: {
          path: envResult.paths.relativeEnvPath,
          lanHost: envResult.lanHost,
          httpPort: envResult.httpPort,
        },
        executionUpdate: execution,
        validationTests,
        serverConnection: loginUrl
          ? { loginUrl, publicOrigin: origin.origin }
          : priorState?.serverConnection,
      },
      null,
      2,
    ),
    'utf8',
  )

  const manifestPath = getManifestPath(systemId)
  try {
    const raw = await fs.readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (loginUrl) {
      parsed.serverConnection = { loginUrl, publicOrigin: origin.origin }
    }
    parsed.updatedAt = new Date().toISOString()
    await fs.writeFile(manifestPath, JSON.stringify(parsed, null, 2), 'utf8')
  } catch {
    // optional
  }

  return {
    ok: true,
    message: loginUrl
      ? `Atualização concluída. Use Iniciar para subir o Caddy. Login: ${loginUrl}`
      : 'Atualização concluída. Use Iniciar para subir o Caddy.',
    loginUrl,
    output: messages.join('\n').slice(0, 4000),
  }
}
