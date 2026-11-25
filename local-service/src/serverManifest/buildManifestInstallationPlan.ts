import path from 'node:path'
import { getSystemsRoot } from '../installation/paths.ts'
import type { InstallationPlanPayload } from '../plan/buildInstallationPlan.ts'
import type { ServerManifestSummary } from './types.ts'

export const MANIFEST_PACKAGE_MANAGER = 'manifest'

const TOOL_LABELS: Record<string, string> = {
  git: 'Git',
  node: 'Node.js 20+',
  npm: 'npm',
  docker: 'Docker',
  supabaseCli: 'Supabase CLI',
  caddy: 'Caddy',
  psql: 'psql',
  bash: 'bash (Git Bash/WSL no Windows)',
  powershell: 'PowerShell',
}

export function isManifestSummary(value: unknown): value is ServerManifestSummary {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.manifestVersion === 'string' &&
    typeof item.backendProfile === 'string' &&
    Array.isArray(item.phases) &&
    typeof item.validation === 'object' &&
    item.validation !== null
  )
}

/**
 * Etapa 46 — com manifesto presente, o plano é o `installPlan` do manifesto,
 * não o plano genérico npm install/build/preview (:4173).
 */
export function buildManifestInstallationPlan(input: {
  summary: ServerManifestSummary
  sourceUrl: string
  analyzedAt: string
  systemId?: string
}): InstallationPlanPayload {
  const { summary } = input
  const warnings: string[] = []

  if (!summary.validation.ok) {
    warnings.push(...summary.validation.errors.slice(0, 5).map((error) => `Manifesto: ${error}`))
  }
  if (summary.prerequisites && !summary.prerequisites.ok) {
    for (const item of summary.prerequisites.missing.slice(0, 6)) {
      warnings.push(`Pré-requisito: ${item.tool} — ${item.reason}`)
    }
  }
  for (const phase of summary.phases) {
    if (phase.status === 'blocked') warnings.push(`Fase ${phase.id} bloqueada: ${phase.reason ?? 'sem motivo'}`)
    if (phase.note) warnings.push(`Fase ${phase.id}: ${phase.note}`)
  }

  const plannedSteps = summary.phases
    .filter((phase) => phase.status !== 'skip')
    .map((phase, index) => ({
      order: index + 1,
      title: phase.id,
      description: `${phase.description}${phase.requiresElevation ? ' (exige Administrador)' : ''}`,
    }))

  for (const test of summary.validationTests.filter((item) => item.requiredForInstall)) {
    plannedSteps.push({
      order: plannedSteps.length + 1,
      title: `validação: ${test.id}`,
      description: `Executar script ${test.scriptId} (obrigatório para concluir a instalação).`,
    })
  }

  const tools = summary.requiredTools.map((name) => TOOL_LABELS[name] ?? name)
  const base = input.systemId ?? summary.systemId

  return {
    source: 'local-service',
    generatedAt: new Date().toISOString(),
    basedOnAnalysisAt: input.analyzedAt,
    projectName: summary.productDisplayName,
    sourceUrl: input.sourceUrl,
    plannedInstallDirectory: path.join(getSystemsRoot(), base),
    primaryLanguage: 'TypeScript',
    framework: 'React + Supabase local + Caddy',
    packageManager: MANIFEST_PACKAGE_MANAGER,
    technologySummary: `Perfil ${summary.backendProfile} · manifesto ${summary.manifestVersion}`,
    systemDependencies: tools,
    projectDependencies: [],
    installCommands: [],
    buildCommand: null,
    startCommand: null,
    devCommand: null,
    identifiedPorts: [summary.httpPort],
    databaseRequired: true,
    databaseType: 'PostgreSQL (Supabase local via Docker)',
    environmentVariables: summary.environmentKeys,
    configurationFiles: ['Transferir para Servidor/servidor-lan/servidor.env'],
    prerequisites: tools,
    warnings,
    risks: [
      'A instalação altera o computador servidor (Docker, firewall do Windows, portas). Execute somente após confirmação.',
      `Clientes devem usar apenas a porta ${summary.httpPort} (Caddy); nunca :54321/:54322 na LAN.`,
      'Não use npm run preview (:4173) para AcompOPMS — acesso LAN via Caddy conforme manifesto.',
    ],
    confidenceLevel: summary.validation.ok ? 'alta' : 'baixa',
    plannedSteps,
    disclaimer:
      'Plano derivado do server-manifest.json (installPlan.phases). Nenhuma alteração foi realizada. Supabase permanece local.',
    database: {
      required: true,
      engine: 'postgresql',
      engineLabel: 'PostgreSQL (Supabase local)',
      confidence: 'high',
      detectedFrom: ['server-manifest.json'],
      prerequisites: ['Docker', 'Supabase CLI'],
      environmentVariables: [],
      provisioningRequired: false,
      notes: [
        'Banco gerenciado pelo Supabase local (Docker) via fases do manifesto — sem provisionamento pelo Manager.',
      ],
    },
  }
}
