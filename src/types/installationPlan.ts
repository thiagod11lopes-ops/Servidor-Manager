import type { InstallationPlanDatabase } from './database.ts'

export type InstallationPlanStep = {
  order: number
  title: string
  description: string
}

export type InstallationPlan = {
  source: 'local-service'
  generatedAt: string
  basedOnAnalysisAt: string
  projectName: string
  sourceUrl: string
  plannedInstallDirectory: string
  primaryLanguage: string
  framework: string
  packageManager: string
  technologySummary: string
  systemDependencies: string[]
  projectDependencies: string[]
  installCommands: string[]
  buildCommand: string | null
  startCommand: string | null
  devCommand: string | null
  identifiedPorts: number[]
  databaseRequired: boolean
  databaseType: string
  database?: InstallationPlanDatabase
  environmentVariables: string[]
  configurationFiles: string[]
  prerequisites: string[]
  warnings: string[]
  risks: string[]
  confidenceLevel: 'baixa' | 'media' | 'alta'
  plannedSteps: InstallationPlanStep[]
  disclaimer: string
}

export type InstallationPlanResponse =
  | { ok: true; plan: InstallationPlan }
  | { ok: false; message: string }
