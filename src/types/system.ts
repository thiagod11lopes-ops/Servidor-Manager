import type { InstallationPlan } from './installationPlan.ts'
import type { InstallationResult } from './installationResult.ts'
import type { SystemAnalysisResult } from './systemAnalysis.ts'
import type { SystemDatabaseAnalysis } from './database.ts'
import type { SystemRuntimeStatus } from './systemRuntime.ts'
import type { SystemServiceStatus } from './systemService.ts'

export type SystemStatus = 'nao_instalado' | 'instalado' | 'erro_instalacao'

export type SystemTechnology = 'aguardando_analise' | 'analisada'

export type SystemSourceKind = 'git' | 'localFolder'

export type ManagedSystem = {
  id: string
  name: string
  url: string
  sourceKind?: SystemSourceKind
  localFolderPath?: string
  status: SystemStatus
  technology: SystemTechnology
  createdAt: string
  analysis?: SystemAnalysisResult
  installationPlan?: InstallationPlan
  installation?: InstallationResult
  runtime?: SystemRuntimeStatus
  databaseAnalysis?: SystemDatabaseAnalysis
  serviceStatus?: SystemServiceStatus
}

export const systemStatusLabel: Record<SystemStatus, string> = {
  nao_instalado: 'Não instalado',
  instalado: 'Instalado',
  erro_instalacao: 'Erro na instalação',
}

export const systemTechnologyLabel: Record<SystemTechnology, string> = {
  aguardando_analise: 'Aguardando análise',
  analisada: 'Analisada',
}

export function displayTechnology(system: ManagedSystem): string {
  if (system.analysis) return system.analysis.framework
  return systemTechnologyLabel[system.technology]
}
