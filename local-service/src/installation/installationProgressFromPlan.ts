import type { InstallationPlanPayload } from '../plan/buildInstallationPlan.ts'

const MANIFEST_PREP_PHASES = [
  {
    id: 'install.prepare',
    label: 'Preparação',
    description: 'Diretório de instalação e validação da origem Git.',
  },
  {
    id: 'install.git-clone',
    label: 'Clone Git',
    description: 'Obtenção do código-fonte no ServidorManager.',
  },
  {
    id: 'install.manifest-validate',
    label: 'Validação do manifesto',
    description: 'Schema, scripts e fases do server-manifest.json.',
  },
  {
    id: 'install.prerequisites',
    label: 'Pré-requisitos',
    description: 'Ferramentas e serviços exigidos pelo perfil manifesto.',
  },
  {
    id: 'install.servidor-env',
    label: 'Configuração servidor.env',
    description: 'Modo de acesso (Local ou LAN) e variáveis do servidor-lan.',
  },
] as const

const LEGACY_PREP_PHASES = [
  {
    id: 'install.prepare',
    label: 'Preparação',
    description: 'Diretório de instalação e clone Git.',
  },
  {
    id: 'install.git-clone',
    label: 'Clone Git',
    description: 'Obtenção do código-fonte.',
  },
  {
    id: 'install.project-env',
    label: 'Ambiente do projeto',
    description: 'Arquivos .env e ajustes de preview quando aplicável.',
  },
] as const

export function buildInstallationProgressPhases(
  plan: InstallationPlanPayload,
): Array<{ id: string; label: string; description?: string }> {
  if (plan.packageManager === 'manifest') {
    const manifestPhases = plan.plannedSteps.map((step) => ({
      id: step.title,
      label: humanizePhaseId(step.title),
      description: step.description,
    }))
    return [...MANIFEST_PREP_PHASES, ...manifestPhases]
  }

  const legacy: Array<{ id: string; label: string; description?: string }> = [...LEGACY_PREP_PHASES]
  if (plan.installCommands.length > 0) {
    legacy.push({
      id: 'install.dependencies',
      label: 'Dependências',
      description: plan.installCommands.join(' · '),
    })
  }
  if (plan.buildCommand) {
    legacy.push({
      id: 'install.build',
      label: 'Build',
      description: plan.buildCommand,
    })
  }
  for (const step of plan.plannedSteps) {
    legacy.push({
      id: step.title,
      label: step.title,
      description: step.description,
    })
  }
  return legacy
}

function humanizePhaseId(id: string): string {
  if (id.startsWith('validação: ')) {
    return `Validação — ${id.slice('validação: '.length)}`
  }
  return id.replace(/\./g, ' · ')
}
