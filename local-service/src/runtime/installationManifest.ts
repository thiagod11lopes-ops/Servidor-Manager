import fs from 'node:fs/promises'
import type { InstallationPlanPayload } from '../plan/buildInstallationPlan.ts'
import { getManifestPath } from '../installation/paths.ts'
import { SUPPORTED_BACKEND_PROFILE } from '../serverManifest/types.ts'

export type InstallationManifest = {
  ok: boolean
  systemId: string
  installDirectory: string
  projectDirectory: string
  installedAt: string
  sourceUrl?: string
  serverManifestProfile?: string
  serverConnection?: {
    loginUrl?: string
    publicOrigin?: string
  }
  runtimePlan?: {
    packageManager: string
    startCommand: string | null
    devCommand: string | null
    identifiedPorts: number[]
  }
}

export function isManifestLanInstallation(manifest: InstallationManifest): boolean {
  if (manifest.serverManifestProfile === SUPPORTED_BACKEND_PROFILE) return true
  return manifest.runtimePlan?.packageManager === 'manifest'
}

export async function readInstallationManifest(systemId: string): Promise<InstallationManifest | null> {
  try {
    const raw = await fs.readFile(getManifestPath(systemId), 'utf8')
    const parsed = JSON.parse(raw) as InstallationManifest
    if (!parsed.ok || parsed.systemId !== systemId) return null
    return parsed
  } catch {
    return null
  }
}

export function manifestToPlan(manifest: InstallationManifest): InstallationPlanPayload | null {
  if (!manifest.runtimePlan) return null

  return {
    source: 'local-service',
    generatedAt: manifest.installedAt,
    basedOnAnalysisAt: manifest.installedAt,
    projectName: manifest.systemId,
    sourceUrl: '',
    plannedInstallDirectory: manifest.installDirectory,
    primaryLanguage: '',
    framework: '',
    packageManager: manifest.runtimePlan.packageManager,
    technologySummary: '',
    systemDependencies: [],
    projectDependencies: [],
    installCommands: [],
    buildCommand: null,
    startCommand: manifest.runtimePlan.startCommand,
    devCommand: manifest.runtimePlan.devCommand,
    identifiedPorts: manifest.runtimePlan.identifiedPorts,
    databaseRequired: false,
    databaseType: 'Não identificado',
    environmentVariables: [],
    configurationFiles: [],
    prerequisites: [],
    warnings: [],
    risks: [],
    confidenceLevel: 'media',
    plannedSteps: [],
    disclaimer: '',
    database: {
      required: false,
      engine: 'none',
      engineLabel: 'Não identificado',
      confidence: 'low',
      detectedFrom: [],
      prerequisites: [],
      environmentVariables: [],
      provisioningRequired: false,
      notes: [],
    },
  }
}
