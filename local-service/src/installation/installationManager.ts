import fs from 'node:fs/promises'
import type { InstallationPlanPayload } from '../plan/buildInstallationPlan.ts'
import { resolveProjectRoot } from '../analysis/analyzeProjectTree.ts'
import { cloneGitToDirectory } from '../sources/cloneGitToDirectory.ts'
import { copyLocalFolderToDirectory } from '../sources/copyLocalFolderToDirectory.ts'
import type { ProjectInstallSource } from '../sources/projectInstallSource.ts'
import { resolveBuildCommand, resolveInstallCommand } from './controlledCommands.ts'
import { getManifestPath, getProjectDirectory, getServerManifestStatePath, getSystemRoot } from './paths.ts'
import { checkInstallationPrerequisites } from './prerequisites.ts'
import { applyProjectEnvironmentTemplate } from './applyProjectEnvironmentTemplate.ts'
import { patchVitePreviewForLan } from './patchVitePreviewForLan.ts'
import { formatInstallFailureMessage } from './formatInstallFailure.ts'
import { runControlledCommand } from './runControlledCommand.ts'
import { isSupportedProfile, loadServerManifest } from '../serverManifest/loadServerManifest.ts'
import type { SystemAccessMode } from '../config/systemAccessMode.ts'
import { runManifestInstallation, type ManifestInstallationPaused } from '../serverManifest/runManifestInstallation.ts'
import {
  markInstallationPhaseCompleted,
  markInstallationPhaseFailed,
  markInstallationPhaseRunning,
} from './installationProgressStore.ts'

export type InstallationResultPayload = {
  ok: boolean
  systemId: string
  installDirectory: string
  projectDirectory: string
  installedAt: string
  dependencyInstall: 'sucesso' | 'nao_executado' | 'falha'
  buildStatus: 'executado' | 'nao_identificado' | 'nao_executado' | 'falha'
  databaseNote: string
  messages: string[]
  error?: string
}

function errorResult(
  partial: Pick<InstallationResultPayload, 'systemId' | 'installDirectory' | 'projectDirectory' | 'messages'> & {
    error: string
  },
): { ok: false; result: InstallationResultPayload } {
  return {
    ok: false,
    result: {
      ok: false,
      systemId: partial.systemId,
      installDirectory: partial.installDirectory,
      projectDirectory: partial.projectDirectory,
      installedAt: new Date().toISOString(),
      dependencyInstall: 'nao_executado',
      buildStatus: 'nao_executado',
      databaseNote: 'Banco de dados não configurado nesta etapa.',
      messages: partial.messages,
      error: partial.error,
    },
  }
}

export type RunInstallationOutcome =
  | { ok: true; result: InstallationResultPayload }
  | { ok: false; result: InstallationResultPayload }
  | ManifestInstallationPaused

export async function runInstallation(input: {
  systemId: string
  projectSource: ProjectInstallSource
  plan: InstallationPlanPayload
  /** IPv4 LAN fixo ou omitir para `auto` (manifesto supabase-local-v1). */
  lanHost?: string
  overlayEnabled?: boolean
  accessMode?: SystemAccessMode
  resumeAfterDockerPause?: boolean
}): Promise<RunInstallationOutcome> {
  const installDirectory = getSystemRoot(input.systemId)
  const projectDirectory = getProjectDirectory(input.systemId)
  const messages: string[] = []

  const isManifestPlan = input.plan.packageManager === 'manifest'

  if (!isManifestPlan) {
  const prerequisites = await checkInstallationPrerequisites({
    packageManager: input.plan.packageManager,
    installCommands: input.plan.installCommands,
  })

  if (!prerequisites.ok) {
    const details = prerequisites.missing
      .map((item) => `${item.tool}: ${item.reason} (etapa: ${item.step})`)
      .join(' | ')
    messages.push('Pré-requisitos ausentes detectados.')
    return errorResult({
      systemId: input.systemId,
      installDirectory,
      projectDirectory,
      messages,
      error: details,
    })
  }
  }

  if (input.resumeAfterDockerPause) {
    messages.push('Retomando instalação: diretório já preparado.')
    markInstallationPhaseCompleted(input.systemId, 'install.prepare', 'Retomada após Docker.')
  } else {
    markInstallationPhaseRunning(input.systemId, 'install.prepare')
    messages.push('Diretório de instalação preparado.')
    await fs.mkdir(installDirectory, { recursive: true })
    markInstallationPhaseCompleted(input.systemId, 'install.prepare')
  }

  const sourceUrlForErrors = input.projectSource.sourceUrl

  if (input.resumeAfterDockerPause) {
    messages.push(
      input.projectSource.kind === 'localFolder'
        ? 'Retomando instalação: cópia da pasta local já concluída.'
        : 'Retomando instalação: clone Git já concluído.',
    )
    markInstallationPhaseCompleted(input.systemId, 'install.git-clone', 'Retomada após Docker.')
  } else {
    markInstallationPhaseRunning(input.systemId, 'install.git-clone')
    try {
      let updateInPlace = false
      try {
        const prior = JSON.parse(await fs.readFile(getServerManifestStatePath(input.systemId), 'utf8')) as {
          status?: string
          executionBuild?: { ok?: boolean }
        }
        updateInPlace =
          prior.executionBuild?.ok === true &&
          (prior.status === 'phases-through-build-ok' || prior.status === 'phases-failed')
      } catch {
        updateInPlace = false
      }

      let sourceLabel: string
      if (input.projectSource.kind === 'localFolder') {
        sourceLabel = await copyLocalFolderToDirectory(
          input.projectSource.localFolderPath,
          projectDirectory,
          { updateInPlace },
        )
        messages.push(`Código copiado da pasta local (${sourceLabel}).`)
      } else {
        sourceLabel = await cloneGitToDirectory(input.projectSource.sourceUrl, projectDirectory, {
          updateInPlace,
        })
        messages.push(`Código-fonte obtido via Git (${sourceLabel}).`)
      }
      markInstallationPhaseCompleted(input.systemId, 'install.git-clone', sourceLabel)
    } catch {
      markInstallationPhaseFailed(
        input.systemId,
        'install.git-clone',
        formatInstallFailureMessage({ sourceUrl: sourceUrlForErrors, stage: 'clone' }),
      )
      return errorResult({
        systemId: input.systemId,
        installDirectory,
        projectDirectory,
        messages,
        error: formatInstallFailureMessage({ sourceUrl: sourceUrlForErrors, stage: 'clone' }),
      })
    }
  }

  // Perfil manifest-driven (supabase-local-v1): ignora npm install/build/preview e segue o installPlan do manifesto.
  const detectedManifest = await loadServerManifest(projectDirectory)
  if (detectedManifest.found) {
    if (!detectedManifest.ok) {
      return errorResult({
        systemId: input.systemId,
        installDirectory,
        projectDirectory,
        messages,
        error: detectedManifest.error,
      })
    }
    if (isSupportedProfile(detectedManifest.manifest)) {
      return runManifestInstallation({
        systemId: input.systemId,
        sourceUrl: sourceUrlForErrors,
        installDirectory,
        projectDirectory,
        messages,
        accessMode: input.accessMode,
        lanHost: input.lanHost,
        overlayEnabled: input.overlayEnabled,
        installationPlan: input.plan,
        resumeAfterDockerPause: input.resumeAfterDockerPause,
      })
    }
    messages.push(
      `server-manifest.json encontrado com perfil não suportado (${detectedManifest.manifest.manager?.backendProfile ?? 'ausente'}); usando instalação genérica.`,
    )
  }

  const workingDirectory = await resolveProjectRoot(projectDirectory)
  messages.push(`Diretório de trabalho do projeto: ${workingDirectory}`)

  markInstallationPhaseRunning(input.systemId, 'install.project-env')
  const envApply = await applyProjectEnvironmentTemplate(workingDirectory)
  messages.push(envApply.message)
  markInstallationPhaseCompleted(input.systemId, 'install.project-env', envApply.message)

  if (await patchVitePreviewForLan(workingDirectory)) {
    messages.push('vite.config.ts: preview.allowedHosts habilitado (fluxo legado :4173 — não use para AcompOPMS manifest).')
  }

  let dependencyInstall: InstallationResultPayload['dependencyInstall'] = 'nao_executado'
  const installCommand = resolveInstallCommand(input.plan)

  if (!installCommand) {
    messages.push('Instalação de dependências não executada — gerenciador não determinado com segurança.')
  } else {
    messages.push(`Executando ${installCommand.label}...`)
    markInstallationPhaseRunning(input.systemId, 'install.dependencies', installCommand.label)
    const installRun = await runControlledCommand(installCommand, workingDirectory)
    if (!installRun.ok) {
      markInstallationPhaseFailed(input.systemId, 'install.dependencies', 'Falha ao instalar dependências.')
      messages.push('Falha ao instalar dependências.')
      return errorResult({
        systemId: input.systemId,
        installDirectory,
        projectDirectory: workingDirectory,
        messages: [...messages, installRun.output.slice(0, 8000)],
        error: formatInstallFailureMessage({
          sourceUrl: sourceUrlForErrors,
          stage: 'dependencies',
          commandOutput: installRun.output,
        }),
      })
    }
    dependencyInstall = 'sucesso'
    messages.push('Dependências instaladas com sucesso.')
    markInstallationPhaseCompleted(input.systemId, 'install.dependencies')
  }

  let buildStatus: InstallationResultPayload['buildStatus'] = 'nao_identificado'
  const buildCommand = resolveBuildCommand(input.plan)

  if (!input.plan.buildCommand) {
    buildStatus = 'nao_identificado'
    messages.push('Build não identificado — nenhum comando de build foi executado.')
  } else if (!buildCommand) {
    buildStatus = 'nao_identificado'
    messages.push('Build identificado no plano, mas não pôde ser validado para execução segura.')
  } else {
    messages.push(`Executando ${buildCommand.label}...`)
    markInstallationPhaseRunning(input.systemId, 'install.build', buildCommand.label)
    const buildRun = await runControlledCommand(buildCommand, workingDirectory)
    if (!buildRun.ok) {
      buildStatus = 'falha'
      markInstallationPhaseFailed(input.systemId, 'install.build', 'Falha ao executar build.')
      messages.push('Falha ao executar build.')
      return errorResult({
        systemId: input.systemId,
        installDirectory,
        projectDirectory: workingDirectory,
        messages: [...messages, buildRun.output.slice(0, 8000)],
        error: formatInstallFailureMessage({
          sourceUrl: sourceUrlForErrors,
          stage: 'build',
          commandOutput: buildRun.output,
        }),
      })
    }
    buildStatus = 'executado'
    messages.push('Build executado com sucesso.')
    markInstallationPhaseCompleted(input.systemId, 'install.build')
  }

  const databaseNote = input.plan.databaseRequired
    ? `Indicação de banco: ${input.plan.databaseType}. Configuração real não realizada nesta etapa.`
    : 'Nenhuma configuração de banco de dados realizada nesta etapa.'

  const result: InstallationResultPayload = {
    ok: true,
    systemId: input.systemId,
    installDirectory,
    projectDirectory: workingDirectory,
    installedAt: new Date().toISOString(),
    dependencyInstall,
    buildStatus,
    databaseNote,
    messages,
  }

  const manifest = {
    ...result,
    runtimePlan: {
      packageManager: input.plan.packageManager,
      startCommand: input.plan.startCommand,
      devCommand: input.plan.devCommand,
      identifiedPorts: input.plan.identifiedPorts,
    },
  }

  await fs.writeFile(getManifestPath(input.systemId), JSON.stringify(manifest, null, 2), 'utf8')

  return { ok: true, result }
}
