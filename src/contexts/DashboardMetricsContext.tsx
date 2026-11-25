import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getLocalServiceBaseUrl } from '../services/localServiceConfig.ts'
import { localManagerService } from '../services/index.ts'
import { HttpLocalManagerClient } from '../services/httpLocalManagerClient.ts'
import type { CpuMetrics, MemoryMetrics, ServerInstalledInventory } from '../types/managerService.ts'
import type { DatabaseSummary } from '../types/database.ts'
import type { DashboardInstalledSystemRow } from '../types/dashboard.ts'
import type { DashboardOperationalStatus, OnlineUsersOverview } from '../types/monitoring.ts'
import { dashboardLocalServiceCardLabel } from '../utils/packagedBundledOmps.ts'
import { systemRuntimeStateLabel, type SystemRuntimeState } from '../types/systemRuntime.ts'
import { dashboardSystemDisplayName } from '../utils/dashboardSystemDisplayName.ts'

export type DashboardMetricsState = {
  cpu: CpuMetrics
  memory: MemoryMetrics
  installedInventory: ServerInstalledInventory
  databaseSummary: DatabaseSummary
  onlineUsers: OnlineUsersOverview
  operational: DashboardOperationalStatus
  installedSystems: DashboardInstalledSystemRow[]
  metricsReady: boolean
  lastUpdatedAt: string | null
  isRefreshing: boolean
  refresh: () => Promise<void>
}

const monitoringClient = new HttpLocalManagerClient()

const initialMetrics: Omit<
  DashboardMetricsState,
  'metricsReady' | 'lastUpdatedAt' | 'isRefreshing' | 'refresh'
> = {
  cpu: {
    displayValue: '18%',
    usagePercent: 18,
    detail: 'Uso demonstrativo',
  },
  memory: {
    usagePercent: 42,
    detail: '6,7 GB de 16 GB',
  },
  installedInventory: {
    confirmed: false,
    message: 'Carregando inventário de instalações…',
  },
  databaseSummary: { systemsRequiringDatabase: 0, postgresqlServerAvailable: false },
  onlineUsers: {
    collectedAt: '',
    count: null,
    detail: 'Carregando usuários online…',
    perSystem: [],
    users: [],
  },
  operational: {
    level: 'checking',
    label: 'Verificando',
    summary: 'O sistema está realizando verificações para determinar sua condição atual.',
    details: [],
  },
  installedSystems: [],
}

type DiscoveredApiRow = {
  systemId: string
  sourceUrl: string | null
  loginUrl: string | null
  databaseNumber: string | null
  installedAt: string | null
}

async function fetchInstalledSystemRows(): Promise<DashboardInstalledSystemRow[]> {
  const baseUrl = getLocalServiceBaseUrl()
  let systems: DiscoveredApiRow[] = []
  try {
    const response = await fetch(`${baseUrl}/api/v1/systems/discovered`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    })
    if (response.ok) {
      const payload = (await response.json()) as { systems?: DiscoveredApiRow[] }
      systems = payload.systems ?? []
    }
  } catch {
    return []
  }

  const rows = await Promise.all(
    systems.map(async (row) => {
      let state: SystemRuntimeState | 'desconhecido' = 'desconhecido'
      let stateLabel = 'Estado desconhecido'
      let lastError: string | null = null
      let loginUrl = row.loginUrl

      try {
        const runtime = await monitoringClient.getSystemRuntimeStatus(row.systemId)
        if (runtime.ok) {
          state = runtime.status.state
          stateLabel = systemRuntimeStateLabel[runtime.status.state]
          lastError = runtime.status.lastError
          loginUrl = runtime.status.loginUrl ?? loginUrl
        } else if (runtime.status) {
          state = runtime.status.state
          stateLabel = systemRuntimeStateLabel[runtime.status.state]
          lastError = runtime.message
        } else {
          lastError = runtime.message
        }
      } catch {
        stateLabel = 'Runtime indisponível'
      }

      return {
        systemId: row.systemId,
        label: dashboardSystemDisplayName(row.sourceUrl, row.systemId),
        sourceUrl: row.sourceUrl,
        loginUrl,
        databaseNumber: row.databaseNumber,
        installedAt: row.installedAt,
        state,
        stateLabel,
        lastError,
        isRunning: state === 'executando' || state === 'iniciando',
      } satisfies DashboardInstalledSystemRow
    }),
  )

  return rows.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

const DashboardMetricsContext = createContext<DashboardMetricsState | null>(null)

export function DashboardMetricsProvider({ children }: { children: ReactNode }) {
  const [metrics, setMetrics] = useState(initialMetrics)
  const [metricsReady, setMetricsReady] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadMetrics = useCallback(async () => {
    const [cpu, memory, installedInventory, databaseSummary, overviewResult, installedSystems] =
      await Promise.all([
        localManagerService.getCpuMetrics(),
        localManagerService.getMemoryMetrics(),
        localManagerService.getServerInstalledInventory(),
        localManagerService.getDatabaseSummary(),
        monitoringClient.getDashboardOverview().catch(() => null),
        fetchInstalledSystemRows(),
      ])

    const onlineUsers =
      overviewResult?.onlineUsers ??
      ({
        collectedAt: new Date().toISOString(),
        count: null,
        detail: 'Indisponível — serviço local não respondeu.',
        perSystem: [],
        users: [],
      } satisfies OnlineUsersOverview)

    const operational =
      overviewResult?.operational ??
      ({
        level: 'checking',
        label: 'Verificando',
        summary: 'Resumo operacional indisponível neste ciclo.',
        details: [
          {
            id: 'overview',
            label: dashboardLocalServiceCardLabel(),
            status: 'warn',
            message:
              'Não foi possível obter a visão consolidada. O serviço em 127.0.0.1:47831 pode estar reiniciando.',
            solutions: [
              'Feche e reabra o Servidor Manager.',
              'Use Atualizar abaixo após alguns segundos.',
            ],
          },
        ],
      } satisfies DashboardOperationalStatus)

    setMetrics({
      cpu,
      memory,
      installedInventory,
      databaseSummary,
      onlineUsers,
      operational,
      installedSystems,
    })
    setLastUpdatedAt(new Date().toISOString())
    setMetricsReady(true)
  }, [])

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await loadMetrics()
    } finally {
      setIsRefreshing(false)
    }
  }, [loadMetrics])

  useEffect(() => {
    let cancelled = false

    async function tick() {
      if (cancelled) return
      await loadMetrics()
    }

    void tick()
    const interval = window.setInterval(() => void tick(), 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [loadMetrics])

  const value = useMemo(
    () => ({
      ...metrics,
      metricsReady,
      lastUpdatedAt,
      isRefreshing,
      refresh,
    }),
    [metrics, metricsReady, lastUpdatedAt, isRefreshing, refresh],
  )

  return <DashboardMetricsContext.Provider value={value}>{children}</DashboardMetricsContext.Provider>
}

export function useDashboardMetricsContext(): DashboardMetricsState {
  const ctx = useContext(DashboardMetricsContext)
  if (!ctx) {
    throw new Error('useDashboardMetricsContext deve ser usado dentro de DashboardMetricsProvider.')
  }
  return ctx
}
