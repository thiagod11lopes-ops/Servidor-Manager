import type { DashboardInstalledSystemRow } from '../types/dashboard.ts'
import type { DashboardUnifiedItem, DashboardUnifiedTone } from '../types/dashboardUnified.ts'
import type { CpuMetrics, MemoryMetrics, ServerInstalledInventory } from '../types/managerService.ts'
import type { DashboardOperationalStatus, OnlineUsersOverview } from '../types/monitoring.ts'
import type { ServerBootstrapStatus } from '../types/serverBootstrap.ts'
import { dependencyStateLabel } from '../types/serverBootstrap.ts'
import { operationalComponentStatusLabel, operationalComponentStatusTone } from './dashboardOperationalLabels.ts'
import { operationalHealthTone } from './operationalHealthCatalog.ts'
import { dashboardLocalServiceCardLabel } from './packagedBundledOmps.ts'

function toneFromOperationalDetail(
  status: DashboardOperationalStatus['details'][number]['status'],
): DashboardUnifiedTone {
  const t = operationalComponentStatusTone(status)
  if (t === 'success') return 'success'
  if (t === 'warning') return 'warning'
  if (t === 'error') return 'error'
  return 'muted'
}

function isDemonstrativeDetail(detail: string): boolean {
  return detail.toLowerCase().includes('demonstrativo')
}

function bootstrapDepsTone(
  status: ServerBootstrapStatus | null,
  loading: boolean,
  error: string | undefined,
): DashboardUnifiedTone {
  if (error) return 'error'
  if (loading && !status) return 'checking'
  if (!status) return 'muted'
  const criticalBad = status.dependencies.some((d) => d.critical && d.state !== 'ok' && d.state !== 'not_applicable')
  if (criticalBad) return 'warning'
  return status.ok ? 'success' : 'warning'
}

function bootstrapDepsLabel(
  status: ServerBootstrapStatus | null,
  loading: boolean,
  error: string | undefined,
): string {
  if (error) return 'Indisponível'
  if (loading && !status) return 'Verificando'
  if (!status) return 'Pendente'
  if (status.ok) return 'Operacional'
  const first = status.dependencies.find((d) => d.critical && d.state !== 'ok' && d.state !== 'not_applicable')
  if (first) return `${first.label}: ${dependencyStateLabel(first.state)}`
  return 'Atenção'
}

function bootstrapPrepareTone(
  prepared: boolean,
  loading: boolean,
  error: string | undefined,
  jobPhase: string | undefined,
): DashboardUnifiedTone {
  if (error || jobPhase === 'error') return 'error'
  if (jobPhase === 'running' || jobPhase === 'queued') return 'checking'
  if (loading && !prepared) return 'checking'
  if (prepared) return 'success'
  return 'warning'
}

function systemRowTone(row: DashboardInstalledSystemRow): DashboardUnifiedTone {
  if (row.isRunning || row.state === 'executando' || row.state === 'iniciando') return 'success'
  if (row.state === 'erro') return 'error'
  if (row.state === 'parado' || row.state === 'instalado') return 'muted'
  return 'muted'
}

export type BuildDashboardUnifiedItemsInput = {
  metricsReady: boolean
  operational: DashboardOperationalStatus
  installedInventory: ServerInstalledInventory
  cpu: CpuMetrics
  memory: MemoryMetrics
  onlineUsers: OnlineUsersOverview
  installedSystems: DashboardInstalledSystemRow[]
  bootstrapStatus: ServerBootstrapStatus | null
  bootstrapLoading: boolean
  bootstrapError: string | undefined
  bootstrapPrepared: boolean
  bootstrapJobPhase: string | undefined
}

export type DashboardUnifiedSections = {
  gridItems: DashboardUnifiedItem[]
  systemItems: DashboardUnifiedItem[]
}

function localManagerServiceItem(
  operational: DashboardOperationalStatus,
  metricsReady: boolean,
): DashboardUnifiedItem {
  const overviewDetail = operational.details.find((d) => d.id === 'overview')
  if (overviewDetail) {
    return {
      id: 'operational-overview',
      name:
        overviewDetail.id === 'overview' ? dashboardLocalServiceCardLabel() : overviewDetail.label,
      statusLabel: operationalComponentStatusLabel(overviewDetail.status),
      tone: toneFromOperationalDetail(overviewDetail.status),
      icon: 'server',
    }
  }
  return {
    id: 'local-service',
    name: dashboardLocalServiceCardLabel(),
    statusLabel: metricsReady ? 'Operacional' : 'Verificando',
    tone: metricsReady ? 'success' : 'checking',
    icon: 'server',
  }
}

/** Nove blocos fixos do dashboard (grade 3×3). Demais verificações operacionais ficam no modal da saúde geral. */
export function buildDashboardUnifiedSections(input: BuildDashboardUnifiedItemsInput): DashboardUnifiedSections {
  const {
    metricsReady,
    operational,
    installedInventory,
    cpu,
    memory,
    onlineUsers,
    installedSystems,
    bootstrapStatus,
    bootstrapLoading,
    bootstrapError,
    bootstrapPrepared,
    bootstrapJobPhase,
  } = input

  const globalTone = operationalHealthTone(operational.level)
  const globalUnifiedTone: DashboardUnifiedTone =
    globalTone === 'success'
      ? 'success'
      : globalTone === 'warning'
        ? 'warning'
        : globalTone === 'error'
          ? 'error'
          : operational.level === 'checking'
            ? 'checking'
            : 'muted'

  const gridItems: DashboardUnifiedItem[] = []

  gridItems.push({
    id: 'operational-global',
    name: 'Saúde geral do ambiente',
    statusLabel: operational.label,
    tone: globalUnifiedTone,
    icon: 'health',
  })

  gridItems.push(localManagerServiceItem(operational, metricsReady))

  const installedLabel =
    !metricsReady && !installedInventory.confirmed
      ? 'Verificando'
      : installedInventory.confirmed
        ? `${installedInventory.summary.installed} no disco`
        : 'Indisponível'

  gridItems.push({
    id: 'metric-installed',
    name: 'Sistemas instalados',
    statusLabel: installedLabel,
    tone:
      !installedInventory.confirmed && metricsReady
        ? 'muted'
        : installedInventory.confirmed && installedInventory.summary.error > 0
          ? 'warning'
          : installedInventory.confirmed
            ? 'success'
            : 'checking',
    icon: 'systems',
  })

  gridItems.push({
    id: 'metric-running',
    name: 'Sistemas em execução',
    statusLabel:
      !metricsReady && !installedInventory.confirmed
        ? 'Verificando'
        : installedInventory.confirmed
          ? String(installedInventory.summary.running)
          : '—',
    tone:
      installedInventory.confirmed && installedInventory.summary.running > 0
        ? 'success'
        : installedInventory.confirmed
          ? 'muted'
          : 'checking',
    icon: 'systems',
  })

  const cpuDemo = isDemonstrativeDetail(cpu.detail)
  gridItems.push({
    id: 'metric-cpu',
    name: 'CPU do servidor',
    statusLabel: !metricsReady && cpuDemo ? 'Verificando' : cpuDemo ? 'Indisponível' : cpu.displayValue,
    tone: cpuDemo ? 'muted' : 'success',
    icon: 'cpu',
  })

  const memDemo = isDemonstrativeDetail(memory.detail)
  gridItems.push({
    id: 'metric-memory',
    name: 'Memória RAM',
    statusLabel: !metricsReady && memDemo ? 'Verificando' : memDemo ? 'Indisponível' : `${memory.usagePercent}%`,
    tone: memDemo ? 'muted' : 'success',
    icon: 'memory',
  })

  gridItems.push({
    id: 'online-users',
    name: 'Utilizadores online na rede',
    statusLabel:
      onlineUsers.count != null
        ? onlineUsers.count === 0
          ? 'Nenhum'
          : String(onlineUsers.count)
        : metricsReady
          ? 'Indisponível'
          : 'Verificando',
    tone:
      onlineUsers.count != null && onlineUsers.count > 0
        ? 'success'
        : onlineUsers.count === 0
          ? 'muted'
          : 'warning',
    icon: 'users',
  })

  gridItems.push({
    id: 'bootstrap-deps',
    name: 'Pré-requisitos do servidor (manifest)',
    statusLabel: bootstrapDepsLabel(bootstrapStatus, bootstrapLoading, bootstrapError),
    tone: bootstrapDepsTone(bootstrapStatus, bootstrapLoading, bootstrapError),
    icon: 'server',
  })

  gridItems.push({
    id: 'bootstrap-prepare',
    name: 'Preparar este computador',
    statusLabel: bootstrapPrepared
      ? 'Preparado'
      : bootstrapJobPhase === 'running' || bootstrapJobPhase === 'queued'
        ? 'Preparando'
        : bootstrapError
          ? 'Problema'
          : bootstrapLoading && !bootstrapStatus
            ? 'Verificando'
            : 'Pendente',
    tone: bootstrapPrepareTone(bootstrapPrepared, bootstrapLoading, bootstrapError, bootstrapJobPhase),
    icon: 'prepare',
  })

  const systemItems: DashboardUnifiedItem[] = installedSystems.map((row) => ({
    id: `system-${row.systemId}`,
    name: row.label,
    statusLabel: row.stateLabel,
    tone: systemRowTone(row),
    icon: 'system',
  }))

  return { gridItems, systemItems }
}

export function buildDashboardUnifiedItems(input: BuildDashboardUnifiedItemsInput): DashboardUnifiedItem[] {
  const { gridItems, systemItems } = buildDashboardUnifiedSections(input)
  return [...gridItems, ...systemItems]
}
