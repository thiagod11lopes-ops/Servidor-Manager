import type { InstallationPlan } from '../types/installationPlan.ts'
import type { InstallationResult } from '../types/installationResult.ts'
import type { SystemStatus } from '../types/system.ts'
import type { SystemAnalysisResult } from '../types/systemAnalysis.ts'
import type { ManagedSystem, SystemSourceKind, SystemTechnology } from '../types/system.ts'

const STORAGE_KEY = 'servidor-manager.systems.v1'

function isSystemAnalysisResult(value: unknown): value is SystemAnalysisResult {
  if (!value || typeof value !== 'object') return false

  const item = value as Record<string, unknown>
  const legacyMock = item.mock === true && item.source === undefined

  return (
    typeof item.mock === 'boolean' &&
    (item.source === 'local-service' ||
      item.source === 'mock' ||
      legacyMock) &&
    typeof item.sourceUrl === 'string' &&
    typeof item.projectName === 'string' &&
    typeof item.projectType === 'string' &&
    Array.isArray(item.technologies) &&
    typeof item.framework === 'string'
  )
}

function isInstallationPlan(value: unknown): value is InstallationPlan {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    item.source === 'local-service' &&
    typeof item.projectName === 'string' &&
    typeof item.basedOnAnalysisAt === 'string' &&
    Array.isArray(item.plannedSteps)
  )
}

function isSystemStatus(value: unknown): value is SystemStatus {
  return value === 'nao_instalado' || value === 'instalado' || value === 'erro_instalacao'
}

function isInstallationResult(value: unknown): value is InstallationResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.systemId === 'string' && typeof item.installDirectory === 'string'
}

function isSystemTechnology(value: unknown): value is SystemTechnology {
  return value === 'aguardando_analise' || value === 'analisada'
}

function isManagedSystem(value: unknown): value is ManagedSystem {
  if (!value || typeof value !== 'object') return false

  const item = value as Record<string, unknown>
  const analysis = item.analysis
  const installationPlan = item.installationPlan
  const installation = item.installation

  const sourceKind = item.sourceKind
  const validSourceKind =
    sourceKind === undefined || sourceKind === 'git' || sourceKind === 'localFolder'
  const isLocal =
    sourceKind === 'localFolder' &&
    typeof item.localFolderPath === 'string' &&
    item.localFolderPath.trim().length > 0
  const isGit =
    sourceKind !== 'localFolder' && typeof item.url === 'string' && item.url.trim().length > 0

  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.url === 'string' &&
    validSourceKind &&
    (isLocal || isGit) &&
    isSystemStatus(item.status) &&
    isSystemTechnology(item.technology) &&
    typeof item.createdAt === 'string' &&
    (analysis === undefined || isSystemAnalysisResult(analysis)) &&
    (installationPlan === undefined || isInstallationPlan(installationPlan)) &&
    (installation === undefined || isInstallationResult(installation))
  )
}

export function loadSystems(): ManagedSystem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isManagedSystem)
  } catch {
    return []
  }
}

export function saveSystems(systems: ManagedSystem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(systems))
}

export function createSystem(input: {
  name: string
  url?: string
  sourceKind?: SystemSourceKind
  localFolderPath?: string
}): ManagedSystem {
  if (input.sourceKind === 'localFolder') {
    return {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      url: '',
      sourceKind: 'localFolder',
      localFolderPath: input.localFolderPath?.trim() ?? '',
      status: 'nao_instalado',
      technology: 'aguardando_analise',
      createdAt: new Date().toISOString(),
    }
  }

  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    url: input.url?.trim() ?? '',
    status: 'nao_instalado',
    technology: 'aguardando_analise',
    createdAt: new Date().toISOString(),
  }
}
