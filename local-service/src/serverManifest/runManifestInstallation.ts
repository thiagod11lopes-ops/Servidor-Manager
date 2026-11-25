import fs from 'node:fs/promises'
import path from 'node:path'
import { isCarrierGradeNatIPv4 } from '../config/networkAccess.ts'
import type { InstallationResultPayload } from '../installation/installationManager.ts'
import { getManifestPath, getServerManifestStatePath, getSystemRoot } from '../installation/paths.ts'
import { readProjectGitCommit } from '../sources/readProjectGitCommit.ts'
import { resolveInstallGitRef } from '../sources/resolveInstallGitRef.ts'
import {
  checkManifestServerPrerequisites,
  formatManifestPrerequisitesError,
} from './checkManifestServerPrerequisites.ts'
import { createManifestPhaseHandlers } from './createManifestPhaseHandlers.ts'
import { executePhasePlan } from './executePhasePlan.ts'
import type { SystemAccessMode } from '../config/systemAccessMode.ts'
import { prepareServidorEnv } from './prepareServidorEnv.ts'
import { ensureLanHttpPortForSystem, formatLanHttpAccessHint } from './lanHttpPortGuard.ts'
import { inspectServerManifest } from './summarizeServerManifest.ts'
import { fetchServerConnectionJson, resolveLanHttpOrigin } from './fetchServerConnection.ts'
import { runRequiredPostInstallTests } from './runManifestValidationTests.ts'
import type { PhaseExecutionResult } from './executePhasePlan.ts'
import {
  DOCKER_INSTALL_PAUSE_MESSAGE,
  writeInstallDockerPause,
  type InstallDockerPauseCheckpoint,
} from '../installation/installDockerPause.ts'
import { runManifestInstallDockerGate } from '../installation/installManifestDockerGate.ts'
import {
  applyInstallationPhaseProgressEvent,
  markInstallationAwaitingDocker,
  markInstallationPhaseCompleted,
  markInstallationPhaseFailed,
  markInstallationPhaseRunning,
  markInstallationPhaseSkipped,
} from '../installation/installationProgressStore.ts'
import type { InstallationPlanPayload } from '../plan/buildInstallationPlan.ts'
import { SUPPORTED_BACKEND_PROFILE } from './types.ts'
import { prepareManifestLanItem4Resume } from './prepareManifestLanItem4Resume.ts'
import {
  loadActiveServidorOmpsFixedLanPolicy,
  verifyServidorOmpsFixedLanHostReady,
} from '../products/servidorOmpsFixedLanRuntime.ts'
import { readOmpsSystemPortsRecord } from './ompsSystemPorts.ts'
import { readLanBuildHttpPort } from './readLanBuildHttpPort.ts'
import { isTrustedBundledOmpsPayloadDirectory } from '../bundledOmps/verifyBundledOmpsPayload.ts'
import { parseLocalFolderSourceUrl } from '../sources/localFolderSource.ts'
import { ensureManagerSupabaseLocalIdentity } from './supabaseLocalIdentity.ts'
import { formatManifestToolConstraintSummary } from './manifestToolConstraints.ts'
import { syncSupabaseInternalUrlInServidorEnv } from './syncSupabaseInternalEnv.ts'

function failure(
  input: {
    systemId: string
    installDirectory: string
    projectDirectory: string
    messages: string[]
  },
  error: string,
  extras?: {
    databaseNote?: string
    buildStatus?: InstallationResultPayload['buildStatus']
    dependencyInstall?: InstallationResultPayload['dependencyInstall']
  },
): { ok: false; result: InstallationResultPayload } {
  return {
    ok: false,
    result: {
      ok: false,
      systemId: input.systemId,
      installDirectory: input.installDirectory,
      projectDirectory: input.projectDirectory,
      installedAt: new Date().toISOString(),
      dependencyInstall: extras?.dependencyInstall ?? 'nao_executado',
      buildStatus: extras?.buildStatus ?? 'nao_executado',
      databaseNote:
        extras?.databaseNote ??
        'Banco de dados (Supabase local) não configurado: instalação por manifesto não concluída.',
      messages: input.messages,
      error,
    },
  }
}

function success(
  input: {
    systemId: string
    installDirectory: string
    projectDirectory: string
    messages: string[]
  },
  extras: {
    buildStatus: InstallationResultPayload['buildStatus']
    databaseNote: string
    httpPort: number
    loginUrl: string
  },
): { ok: true; result: InstallationResultPayload } {
  return {
    ok: true,
    result: {
      ok: true,
      systemId: input.systemId,
      installDirectory: input.installDirectory,
      projectDirectory: input.projectDirectory,
      installedAt: new Date().toISOString(),
      dependencyInstall: 'sucesso',
      buildStatus: extras.buildStatus,
      databaseNote: extras.databaseNote,
      messages: input.messages,
    },
  }
}

async function readLanBuildPublicOriginHost(projectDirectory: string): Promise<string | null> {
  try {
    const raw = JSON.parse(
      await fs.readFile(path.join(projectDirectory, 'frontend', 'dist', 'lan-build.json'), 'utf8'),
    ) as { publicOrigin?: string }
    if (typeof raw.publicOrigin !== 'string') return null
    return new URL(raw.publicOrigin).hostname
  } catch {
    return null
  }
}

function shouldRebuildFrontendForLanHost(envLanHost: string, buildHost: string | null): boolean {
  if (!buildHost || envLanHost === 'auto') return false
  if (buildHost === envLanHost) return false
  if (isCarrierGradeNatIPv4(buildHost)) return true
  return buildHost !== envLanHost
}

export type ManifestInstallationPaused = {
  ok: false
  paused: true
  code: 'DOCKER_AWAITING'
  message: string
}

export type ManifestInstallationOutcome =
  | { ok: true; result: InstallationResultPayload }
  | { ok: false; result: InstallationResultPayload }
  | ManifestInstallationPaused

function installationPaused(): ManifestInstallationPaused {
  return { ok: false, paused: true, code: 'DOCKER_AWAITING', message: DOCKER_INSTALL_PAUSE_MESSAGE }
}

async function pauseForDocker(input: {
  systemId: string
  sourceUrl: string
  plan: InstallationPlanPayload
  accessMode?: SystemAccessMode
  lanHost?: string
  overlayEnabled?: boolean
}): Promise<ManifestInstallationPaused> {
  const checkpoint: InstallDockerPauseCheckpoint = {
    version: 1,
    reason: 'docker',
    savedAt: new Date().toISOString(),
    systemId: input.systemId,
    sourceUrl: input.sourceUrl,
    plan: input.plan,
    accessMode: input.accessMode,
    lanHost: input.lanHost,
    overlayEnabled: input.overlayEnabled,
  }
  await writeInstallDockerPause(checkpoint)
  markInstallationAwaitingDocker(input.systemId, 'install.prerequisites', DOCKER_INSTALL_PAUSE_MESSAGE)
  return installationPaused()
}

function collectCompletedScriptIds(...runs: PhaseExecutionResult[]): Set<string> {
  const ids = new Set<string>()
  for (const run of runs) {
    for (const outcome of run.outcomes) {
      if (outcome.status !== 'ok') continue
      if (outcome.phaseId === 'validation.post-install') ids.add('test-server-lan')
    }
  }
  return ids
}

export async function runManifestInstallation(input: {
  systemId: string
  sourceUrl: string
  installDirectory: string
  projectDirectory: string
  messages: string[]
  /** IPv4 fixo ou `auto` (padrão) para ACOMOPMS_LAN_HOST. */
  lanHost?: string
  /** WireGuard overlay (fase opcional overlay.server). Apenas no modo LAN. */
  overlayEnabled?: boolean
  /** Modo escolhido na UI: local (localhost) ou lan (rede Wi‑Fi/Ethernet). */
  accessMode?: SystemAccessMode
  /** Plano REAL enviado pela UI (checkpoint de retomada após Docker). */
  installationPlan?: InstallationPlanPayload
  /** Retomada após modal Docker — pula clone/validação já concluídos. */
  resumeAfterDockerPause?: boolean
}): Promise<ManifestInstallationOutcome> {
  const messages = [...input.messages]
  const context = {
    systemId: input.systemId,
    installDirectory: input.installDirectory,
    projectDirectory: input.projectDirectory,
    messages,
  }

  const resolvedSource = resolveInstallGitRef(input.sourceUrl)
  if (!resolvedSource.ok) {
    return failure(context, resolvedSource.message)
  }
  const gitRef = resolvedSource.gitRef
  if (resolvedSource.sourceKind === 'localFolder') {
    messages.push('Origem: pasta local (sem clone Git).')
  } else if (gitRef) {
    messages.push(`Ref Git do clone: ${gitRef}`)
  }

  const systemId = input.systemId
  let inspected: Awaited<ReturnType<typeof inspectServerManifest>>

  if (input.resumeAfterDockerPause) {
    messages.push('Retomando instalação após Docker Engine ficar operacional…')
    inspected = await inspectServerManifest({
      rootDirectory: input.projectDirectory,
      gitRef,
      overlayEnabled: input.overlayEnabled === true,
      runValidationScript: false,
    })
    if (!inspected.found || !inspected.loaded || !inspected.plan || !inspected.summary) {
      markInstallationPhaseFailed(
        systemId,
        'install.prerequisites',
        'Não foi possível retomar: clone ou manifesto indisponível.',
      )
      return failure(context, 'Não foi possível retomar a instalação — verifique o clone e o manifesto.')
    }
  } else {
    markInstallationPhaseRunning(systemId, 'install.manifest-validate')

    inspected = await inspectServerManifest({
      rootDirectory: input.projectDirectory,
      gitRef,
      overlayEnabled: input.overlayEnabled === true,
      runValidationScript: true,
    })

    if (!inspected.found) {
      markInstallationPhaseFailed(systemId, 'install.manifest-validate', 'server-manifest.json não encontrado na raiz do clone.')
      return failure(context, 'server-manifest.json não encontrado na raiz do clone.')
    }

    if (!inspected.loaded || inspected.loadError) {
      markInstallationPhaseFailed(systemId, 'install.manifest-validate', inspected.loadError ?? 'Manifesto ilegível.')
      return failure(context, inspected.loadError ?? 'Manifesto ilegível.')
    }

    messages.push(
      `Manifesto ${inspected.loaded.manifest.manifestVersion} detectado (perfil ${inspected.loaded.manifest.manager?.backendProfile ?? '?'}).`,
    )

    const validation = inspected.validation
    if (!validation || !validation.ok) {
      const details = (validation?.errors ?? ['Validação indisponível.']).join('\n')
      messages.push('Manifesto reprovado na validação (schema/semântica/script).')
      markInstallationPhaseFailed(systemId, 'install.manifest-validate', `Manifesto inválido:\n${details}`)
      return failure(context, `Manifesto inválido:\n${details}`)
    }
    messages.push('Manifesto validado: schema, referências de scripts/fases e validate-server-manifest.')
    markInstallationPhaseCompleted(systemId, 'install.manifest-validate')

    if (!inspected.plan || !inspected.summary) {
      markInstallationPhaseFailed(systemId, 'install.manifest-validate', 'Sistema operacional não suportado pelo manifesto.')
      return failure(context, 'Sistema operacional não suportado pelo manifesto (apenas Windows e Linux).')
    }
  }

  const fixedLanPolicy = await loadActiveServidorOmpsFixedLanPolicy()
  if (fixedLanPolicy) {
    const hostReady = await verifyServidorOmpsFixedLanHostReady(fixedLanPolicy)
    if (!hostReady.ok) {
      markInstallationPhaseFailed(systemId, 'install.prerequisites', hostReady.message)
      return failure(context, hostReady.message)
    }
  }

  markInstallationPhaseRunning(systemId, 'install.prerequisites', 'Verificando ferramentas do servidor…')
  const localFolderForTrust =
    resolvedSource.sourceKind === 'localFolder'
      ? parseLocalFolderSourceUrl(input.sourceUrl)
      : null
  const omitGitCheck =
    localFolderForTrust != null && (await isTrustedBundledOmpsPayloadDirectory(localFolderForTrust))
  const prerequisites = await checkManifestServerPrerequisites(inspected.loaded!.manifest, {
    skipDockerCheck: true,
    omitGitCheck,
  })
  if (!prerequisites.ok) {
    messages.push('Pré-requisitos do servidor LAN não atendidos.')
    markInstallationPhaseFailed(
      systemId,
      'install.prerequisites',
      `Pré-requisitos ausentes:\n${formatManifestPrerequisitesError(prerequisites.missing)}`,
    )
    return failure(
      context,
      `Instale ou inicie as ferramentas abaixo e tente novamente:\n${formatManifestPrerequisitesError(prerequisites.missing)}`,
    )
  }

  const dockerGate = await runManifestInstallDockerGate({
    manifest: inspected.loaded!.manifest,
    onProgress: (line) => markInstallationPhaseRunning(systemId, 'install.prerequisites', line),
  })
  if (!dockerGate.ok) {
    if ('paused' in dockerGate && dockerGate.paused) {
      if (!input.installationPlan) {
        markInstallationPhaseFailed(
          systemId,
          'install.prerequisites',
          'Instalação pausada por Docker, mas o plano não foi registrado para retomada.',
        )
        return failure(context, DOCKER_INSTALL_PAUSE_MESSAGE)
      }
      return pauseForDocker({
        systemId,
        sourceUrl: input.sourceUrl,
        plan: input.installationPlan,
        accessMode: input.accessMode,
        lanHost: input.lanHost,
        overlayEnabled: input.overlayEnabled,
      })
    }
    markInstallationPhaseFailed(systemId, 'install.prerequisites', dockerGate.error)
    return failure(context, dockerGate.error)
  }

  messages.push(`Pré-requisitos OK (${prerequisites.platform}): ${prerequisites.checked.join(', ')}, Docker (em execução).`)
  messages.push(`Restrições de ferramentas: ${formatManifestToolConstraintSummary(inspected.loaded.manifest)}`)
  markInstallationPhaseCompleted(systemId, 'install.prerequisites')

  const overlayForEnv =
    input.accessMode === 'local' ? false : input.overlayEnabled === true ? true : false

  markInstallationPhaseRunning(systemId, 'install.servidor-env')
  const { collectDiscoveredInstalledSystems } = await import('../systems/discoverInstalledSystems.ts')
  const { syncDatabaseNumberRegistry } = await import('../systems/databaseNumberRegistry.ts')
  const installRegisteredAt = new Date().toISOString()
  const peerSystems = await collectDiscoveredInstalledSystems()
  const databaseAssignments = await syncDatabaseNumberRegistry([
    ...peerSystems
      .filter((item) => item.systemId !== input.systemId)
      .map((item) => ({ systemId: item.systemId, installedAt: item.installedAt })),
    { systemId: input.systemId, installedAt: installRegisteredAt },
  ])
  const databaseNumber = databaseAssignments[input.systemId] ?? null

  if (fixedLanPolicy) {
    const hostReadyBeforeEnv = await verifyServidorOmpsFixedLanHostReady(fixedLanPolicy)
    if (!hostReadyBeforeEnv.ok) {
      markInstallationPhaseFailed(systemId, 'install.servidor-env', hostReadyBeforeEnv.message)
      return failure(context, hostReadyBeforeEnv.message)
    }
  }

  const envResult = await prepareServidorEnv({
    rootDirectory: input.projectDirectory,
    manifest: inspected.loaded.manifest,
    lanHost:
      fixedLanPolicy?.fixed.lanHostMode === 'fixed'
        ? fixedLanPolicy.fixed.expectedLanHost
        : fixedLanPolicy
          ? 'auto'
          : input.lanHost,
    httpPort: fixedLanPolicy?.fixed.requiredHttpPort ?? inspected.summary.httpPort,
    accessMode: fixedLanPolicy ? 'lan' : input.accessMode,
    overlayEnabled: overlayForEnv,
    ...(databaseNumber ? { databaseNumber } : {}),
  })
  if (!envResult.ok) {
    messages.push('Falha ao preparar servidor.env.')
    markInstallationPhaseFailed(systemId, 'install.servidor-env', envResult.message)
    return failure(context, envResult.message)
  }
  messages.push(envResult.message)
  markInstallationPhaseCompleted(systemId, 'install.servidor-env', envResult.message)

  const supabaseIdentity = await ensureManagerSupabaseLocalIdentity({
    systemId: input.systemId,
    rootDirectory: input.projectDirectory,
  })
  if (!supabaseIdentity.ok) {
    markInstallationPhaseFailed(systemId, 'install.servidor-env', supabaseIdentity.message)
    return failure(context, supabaseIdentity.message)
  }
  messages.push(supabaseIdentity.message)
  await syncSupabaseInternalUrlInServidorEnv(
    input.projectDirectory,
    supabaseIdentity.apiPort,
    inspected.loaded.manifest,
  )

  const lanPortResult = await ensureLanHttpPortForSystem({
    systemId: input.systemId,
    rootDirectory: input.projectDirectory,
    manifest: inspected.loaded.manifest,
    preferredPort: envResult.httpPort,
  })
  if (!lanPortResult.ok) {
    markInstallationPhaseFailed(systemId, 'install.servidor-env', lanPortResult.message)
    return failure(context, lanPortResult.message)
  }
  if (lanPortResult.changed) {
    envResult.httpPort = lanPortResult.httpPort
  }
  messages.push(lanPortResult.message)
  messages.push(formatLanHttpAccessHint(envResult.lanHost, lanPortResult.httpPort))

  if (databaseNumber) {
    const { ensureAcompDatabaseNumberUiSupport } = await import('../systems/ensureAcompDatabaseNumberUiSupport.ts')
    const uiPatch = await ensureAcompDatabaseNumberUiSupport(input.projectDirectory)
    if (uiPatch.patched) {
      messages.push('Suporte ao número do banco (BNC) aplicado no frontend AcompSolemp.')
    }
  }

  let priorState: {
    status?: string
    executionBuild?: { ok?: boolean }
    execution?: PhaseExecutionResult
  } | null = null
  try {
    priorState = JSON.parse(await fs.readFile(getServerManifestStatePath(input.systemId), 'utf8')) as {
      status?: string
      executionBuild?: { ok?: boolean }
      execution?: PhaseExecutionResult
    }
  } catch {
    priorState = null
  }

  const skipCompletedPhaseIds = new Set<string>()
  if (priorState?.status === 'phases-failed') {
    for (const block of [
      priorState.execution?.outcomes,
      priorState.executionBuild?.outcomes,
    ]) {
      if (!block) continue
      for (const outcome of block) {
        if (outcome.status === 'ok') skipCompletedPhaseIds.add(outcome.phaseId)
      }
    }
  }

  const skipItem3 =
    priorState?.executionBuild?.ok === true &&
    (priorState?.status === 'phases-through-build-ok' || priorState?.status === 'phases-failed')
  const phaseCtx = {
    systemId: input.systemId,
    rootDirectory: input.projectDirectory,
    manifest: inspected.loaded.manifest,
    platform: inspected.plan.platform,
    log: async (line: string) => {
      messages.push(line)
    },
    reportPhase: (event: Parameters<typeof applyInstallationPhaseProgressEvent>[1]) => {
      applyInstallationPhaseProgressEvent(systemId, event)
    },
  }
  const handlers = createManifestPhaseHandlers()

  let executionBuild: PhaseExecutionResult = { ok: true, outcomes: [] }

  if (skipItem3) {
    messages.push('Retomando instalação: item 3 já concluído (phases-through-build-ok).')
    for (const planned of inspected.plan.phases) {
      const phaseId = planned.phase.id
      if (planned.status === 'skip') {
        markInstallationPhaseSkipped(systemId, phaseId, planned.reason ?? 'Ignorada')
      } else {
        markInstallationPhaseCompleted(systemId, phaseId, 'Concluída em tentativa anterior.')
      }
      if (phaseId === 'frontend.build') break
    }

    const buildHost = await readLanBuildPublicOriginHost(input.projectDirectory)
    if (
      input.accessMode === 'local' &&
      shouldRebuildFrontendForLanHost(envResult.lanHost, buildHost)
    ) {
      messages.push(
        `Build LAN (${buildHost}) não corresponde ao host configurado (${envResult.lanHost}) — reexecutando apenas frontend.build.`,
      )
      const rebuild = await executePhasePlan(inspected.plan, phaseCtx, handlers, {
        runOnlyPhaseIds: new Set(['frontend.build']),
      })
      logPhaseOutcomes(messages, rebuild)
      if (!rebuild.ok) {
        return await persistFailure(context, input.systemId, inspected, envResult, prerequisites, gitRef, {
          execution: rebuild,
          executionBuild,
          buildStatus: 'falha',
        })
      }
    }
  } else {
    messages.push('Item 3: fases até frontend.build (Supabase + schema + auth + build LAN)...')
    executionBuild = await executePhasePlan(inspected.plan, phaseCtx, handlers, {
      executeThroughPhaseId: 'frontend.build',
      skipCompletedPhaseIds: skipCompletedPhaseIds.size > 0 ? skipCompletedPhaseIds : undefined,
    })
    logPhaseOutcomes(messages, executionBuild)
    if (!executionBuild.ok) {
      return await persistFailure(context, input.systemId, inspected, envResult, prerequisites, gitRef, {
        execution: executionBuild,
        buildStatus:
          executionBuild.stoppedAt === 'frontend.build' ? 'falha' : 'nao_executado',
      })
    }
    await fs.writeFile(
      getServerManifestStatePath(input.systemId),
      JSON.stringify(
        {
          profile: SUPPORTED_BACKEND_PROFILE,
          status: 'phases-through-build-ok',
          recordedAt: new Date().toISOString(),
          executionBuild,
          servidorEnv: envResult,
          gitRef,
        },
        null,
        2,
      ),
      'utf8',
    )
  }

  await prepareManifestLanItem4Resume({
    systemId: input.systemId,
    projectDirectory: input.projectDirectory,
    sourceUrl: input.sourceUrl,
    manifest: inspected.loaded.manifest,
    skipCompletedPhaseIds,
    messages,
  })

  if (skipCompletedPhaseIds.size > 0) {
    messages.push(
      `Retomando item 4: ${skipCompletedPhaseIds.size} fase(s) já concluída(s) na tentativa anterior.`,
    )
  }
  if (process.platform === 'win32') {
    messages.push(
      'Item 4 inclui regras de firewall no Windows: aceite o prompt de Administrador (UAC) quando aparecer.',
    )
  }
  const effectiveHttpPort = envResult.httpPort
  messages.push(
    `Item 4: Caddy (porta HTTP ${effectiveHttpPort}), firewall, testes LAN e verify-lan-security...`,
  )
  const executionLan = await executePhasePlan(inspected.plan, phaseCtx, handlers, {
    executeOnlyAfterPhaseId: 'frontend.build',
    skipCompletedPhaseIds: skipCompletedPhaseIds.size > 0 ? skipCompletedPhaseIds : undefined,
  })
  logPhaseOutcomes(messages, executionLan)

  const buildOk =
    skipItem3 ||
    executionBuild.outcomes.some((o) => o.phaseId === 'frontend.build' && o.status === 'ok')
  const supabaseOk =
    skipItem3 ||
    executionBuild.outcomes.some((o) => o.phaseId === 'backend.ensure-started' && o.status === 'ok')

  const partialExtras = {
    buildStatus: (buildOk ? 'executado' : 'falha') as InstallationResultPayload['buildStatus'],
    dependencyInstall: 'sucesso' as const,
    databaseNote: supabaseOk
      ? `Supabase local (Docker) + proxy Caddy na porta HTTP ${envResult.httpPort} conforme server-manifest.`
      : undefined,
  }

  if (!executionLan.ok) {
    return await persistFailure(context, input.systemId, inspected, envResult, prerequisites, gitRef, {
      execution: executionLan,
      executionBuild,
      ...partialExtras,
      stoppedAt: executionLan.stoppedAt,
    })
  }

  const portsRecord = await readOmpsSystemPortsRecord(input.systemId)
  if (portsRecord?.httpPort && portsRecord.httpPort !== envResult.httpPort) {
    envResult.httpPort = portsRecord.httpPort
    messages.push(`Porta HTTP efetiva após proxy LAN: ${portsRecord.httpPort}.`)
  } else {
    const buildPort = await readLanBuildHttpPort(input.projectDirectory)
    if (buildPort != null && buildPort !== envResult.httpPort) {
      envResult.httpPort = buildPort
      messages.push(`Porta HTTP alinhada ao lan-build.json: ${buildPort}.`)
    }
  }

  const validationTests = await runRequiredPostInstallTests({
    ctx: phaseCtx,
    manifest: inspected.loaded.manifest,
    completedScriptIds: collectCompletedScriptIds(executionBuild, executionLan),
  })
  for (const test of validationTests.outcomes) {
    messages.push(`  validação.${test.id} — ${test.ok ? 'ok' : 'falha'}: ${test.message}`)
    const validationPhaseId = `validação: ${test.id}`
    markInstallationPhaseRunning(systemId, validationPhaseId, test.message)
    if (test.ok) {
      markInstallationPhaseCompleted(systemId, validationPhaseId, test.message)
    } else {
      markInstallationPhaseFailed(systemId, validationPhaseId, test.message)
    }
  }
  if (!validationTests.ok) {
    return await persistFailure(context, input.systemId, inspected, envResult, prerequisites, gitRef, {
      execution: executionLan,
      executionBuild,
      validationTests,
      ...partialExtras,
      error: `Teste obrigatório falhou: ${validationTests.outcomes.find((t) => !t.ok)?.message ?? 'verify-lan-security'}`,
    })
  }

  const origin = await resolveLanHttpOrigin({
    rootDirectory: input.projectDirectory,
    manifest: inspected.loaded.manifest,
    httpPort: envResult.httpPort,
  })
  if ('error' in origin) {
    return failure(context, origin.error, partialExtras)
  }

  const connection = await fetchServerConnectionJson(origin.origin, envResult.httpPort)
  if (!connection.ok) {
    return failure(
      context,
      `Instalação concluída, mas não foi possível ler /server-connection.json: ${connection.message}`,
      partialExtras,
    )
  }

  messages.push(`URL para o Instalador OPMS (startUrl): ${connection.loginUrl}`)
  messages.push(`Origem LAN: ${origin.origin}`)
  if (databaseNumber) {
    messages.push(`Número do banco de dados: ${databaseNumber}`)
    const { publishSystemDatabaseNumber } = await import('../systems/publishSystemDatabaseNumber.ts')
    await publishSystemDatabaseNumber({
      projectDirectory: input.projectDirectory,
      manifest: inspected.loaded.manifest,
      databaseNumber,
    })
  }

  const okResult = success(context, {
    buildStatus: 'executado',
    databaseNote: partialExtras.databaseNote ?? 'Supabase local + Caddy LAN.',
    httpPort: envResult.httpPort,
    loginUrl: connection.loginUrl,
  })

  const gitCommitSha = await readProjectGitCommit(input.projectDirectory)

  const state = {
    profile: SUPPORTED_BACKEND_PROFILE,
    recordedAt: new Date().toISOString(),
    sourceUrl: input.sourceUrl,
    gitRef,
    gitCommitSha: gitCommitSha ?? undefined,
    rootDirectory: input.projectDirectory,
    summary: inspected.summary,
    prerequisites: { checked: prerequisites.checked, platform: prerequisites.platform },
    servidorEnv: {
      path: envResult.paths.relativeEnvPath,
      lanHost: envResult.lanHost,
      httpPort: envResult.httpPort,
    },
    executionBuild,
    executionLan,
    validationTests,
    serverConnection: {
      loginUrl: connection.loginUrl,
      publicOrigin: origin.origin,
      payload: connection.payload,
    },
    databaseNumber: databaseNumber ?? undefined,
    status: 'installed-lan',
  }
  await fs.writeFile(getServerManifestStatePath(input.systemId), JSON.stringify(state, null, 2), 'utf8')

  const manifestFile = {
    ...okResult.result,
    sourceUrl: input.sourceUrl,
    serverManifestProfile: SUPPORTED_BACKEND_PROFILE,
    serverConnection: { loginUrl: connection.loginUrl, publicOrigin: origin.origin },
    databaseNumber: databaseNumber ?? undefined,
    runtimePlan: {
      packageManager: 'manifest',
      startCommand: null,
      devCommand: null,
      identifiedPorts: [envResult.httpPort],
    },
  }
  await fs.writeFile(getManifestPath(input.systemId), JSON.stringify(manifestFile, null, 2), 'utf8')

  return okResult
}

function logPhaseOutcomes(messages: string[], execution: PhaseExecutionResult) {
  for (const outcome of execution.outcomes) {
    if (outcome.status === 'not_run') continue
    messages.push(`  ${outcome.order}. ${outcome.phaseId} — ${outcome.status}: ${outcome.message}`)
  }
}

async function persistFailure(
  context: {
    systemId: string
    installDirectory: string
    projectDirectory: string
    messages: string[]
  },
  systemId: string,
  inspected: Awaited<ReturnType<typeof inspectServerManifest>>,
  envResult: Extract<Awaited<ReturnType<typeof prepareServidorEnv>>, { ok: true }>,
  prerequisites: Extract<Awaited<ReturnType<typeof checkManifestServerPrerequisites>>, { ok: true }>,
  gitRef: string | null,
  partial: {
    execution: PhaseExecutionResult
    executionBuild?: PhaseExecutionResult
    validationTests?: Awaited<ReturnType<typeof runRequiredPostInstallTests>>
    buildStatus?: InstallationResultPayload['buildStatus']
    dependencyInstall?: InstallationResultPayload['dependencyInstall']
    databaseNote?: string
    stoppedAt?: string
    error?: string
  },
): Promise<{ ok: false; result: InstallationResultPayload }> {
  const stopped = partial.stoppedAt ?? partial.execution.stoppedAt ?? '?'
  const result = failure(
    context,
    partial.error ??
      `Falha na fase "${stopped}". Detalhes em ${path.join(getSystemRoot(systemId), 'logs', `phase-${stopped}.log`)}`,
    {
      buildStatus: partial.buildStatus,
      dependencyInstall: partial.dependencyInstall,
      databaseNote: partial.databaseNote,
    },
  )
  await fs.writeFile(
    getServerManifestStatePath(systemId),
    JSON.stringify(
      {
        profile: SUPPORTED_BACKEND_PROFILE,
        recordedAt: new Date().toISOString(),
        status: 'phases-failed',
        execution: partial.execution,
        executionBuild: partial.executionBuild,
        validationTests: partial.validationTests,
        servidorEnv: envResult,
        summary: inspected.summary,
        prerequisites: { checked: prerequisites.checked, platform: prerequisites.platform },
        gitRef,
        gitCommitSha: (await readProjectGitCommit(context.projectDirectory)) ?? undefined,
      },
      null,
      2,
    ),
    'utf8',
  )
  await fs.writeFile(
    getManifestPath(systemId),
    JSON.stringify({ ...result.result, serverManifestProfile: SUPPORTED_BACKEND_PROFILE }, null, 2),
    'utf8',
  )
  return result
}
