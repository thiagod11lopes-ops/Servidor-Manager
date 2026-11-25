import fs from 'node:fs/promises'
import { applyProjectEnvironmentTemplate } from '../../installation/applyProjectEnvironmentTemplate.ts'
import { patchProjectEnvForLan } from '../../installation/patchProjectEnvForLan.ts'
import type { ControlledCommand } from '../../installation/controlledCommands.ts'
import { resolveProductionStartCommand } from '../../installation/resolveProductionStart.ts'
import { isManifestLanInstallation, manifestToPlan, readInstallationManifest } from '../installationManifest.ts'

export type ValidatedRuntimeStart = {
  manifest: NonNullable<Awaited<ReturnType<typeof readInstallationManifest>>>
  startCommand: ControlledCommand
  projectDirectory: string
}

export async function resolveValidatedRuntimeStart(
  systemId: string,
): Promise<
  | { ok: true; plan: ValidatedRuntimeStart }
  | { ok: false; message: string }
> {
  const manifest = await readInstallationManifest(systemId)
  if (!manifest) {
    return { ok: false, message: 'Instalação não encontrada para este sistema.' }
  }

  if (isManifestLanInstallation(manifest)) {
    return {
      ok: false,
      message:
        'Este sistema usa Supabase local + Caddy (:8080). Use Iniciar na aba Sistemas — não instale o serviço Windows com preview :4173.',
    }
  }

  if (!manifest.runtimePlan) {
    return {
      ok: false,
      message:
        'Manifesto sem plano de execução. Reinstale o sistema para registrar o comando de início validado.',
    }
  }

  const plan = manifestToPlan(manifest)
  if (!plan) {
    return { ok: false, message: 'Plano de instalação inválido ou incompleto no manifesto.' }
  }

  const startCommand = await resolveProductionStartCommand(plan, manifest.projectDirectory)
  if (!startCommand) {
    return {
      ok: false,
      message: 'Este sistema não possui um comando de inicialização válido.',
    }
  }

  try {
    await fs.access(manifest.projectDirectory)
  } catch {
    return { ok: false, message: 'Diretório do projeto instalado não encontrado.' }
  }

  await applyProjectEnvironmentTemplate(manifest.projectDirectory)
  await patchProjectEnvForLan(manifest.projectDirectory)

  return {
    ok: true,
    plan: {
      manifest,
      startCommand,
      projectDirectory: manifest.projectDirectory,
    },
  }
}
