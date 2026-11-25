import { collectVolumeSnapshots } from './volumeStats.ts'
import {
  readMemoryUsage,
  readWindowsCpuUsagePercent,
  readWindowsNetworkRates,
} from './windowsPerformance.ts'
import type { LiveMetricsSnapshot } from './types.ts'
import { appendHistorySample, loadMonitoringHistory, filterHistory } from './historyStore.ts'
import { reconcileAlertsFromSnapshot, listActiveAlerts, loadMonitoringSettings } from './alertsEngine.ts'
import { collectSystemStorageRows, collectAcompStorageDetail } from './systemStorageProbe.ts'
import {
  deleteSupabaseAuthUser,
  disableSupabaseAuthUser,
  listSupabaseAuthUsers,
} from './supabaseAuthAdmin.ts'
import { readSupabaseStatusJson } from './supabaseLocalInspect.ts'

let latestLive: LiveMetricsSnapshot | null = null
let liveCollecting = false
let storageCollecting = false
let lastStorageAt = 0
let cachedSystemRows: Awaited<ReturnType<typeof collectSystemStorageRows>> = []

const LIVE_INTERVAL_MS = 5_000
const STORAGE_INTERVAL_MS = 45_000
const HISTORY_PERSIST_EVERY = 12

let liveTick = 0

export async function collectLiveSnapshot(): Promise<LiveMetricsSnapshot> {
  liveCollecting = true
  try {
    const collectedAt = new Date().toISOString()
    const [cpu, mem, net, volumes] = await Promise.all([
      readWindowsCpuUsagePercent(),
      Promise.resolve(readMemoryUsage()),
      readWindowsNetworkRates(),
      collectVolumeSnapshots(),
    ])

    const primaryVolume = volumes[0]
    const snapshot: LiveMetricsSnapshot = {
      collectedAt,
      cpuUsagePercent: cpu.value,
      cpuDetail: cpu.detail,
      memoryUsedPercent: mem.usedPercent,
      memoryUsedBytes: mem.usedBytes,
      memoryTotalBytes: mem.totalBytes,
      memoryDetail: mem.detail,
      networkBytesInPerSec: net.inPerSec,
      networkBytesOutPerSec: net.outPerSec,
      networkDetail: net.detail,
      volumes,
      collectionError: null,
    }

    if (cpu.value == null && mem.usedPercent == null && primaryVolume?.usedPercent == null) {
      snapshot.collectionError = 'Nenhuma métrica principal pôde ser coletada neste ciclo.'
    }

    latestLive = snapshot
    liveTick += 1
    if (liveTick % HISTORY_PERSIST_EVERY === 0) {
      await appendHistorySample({
        t: collectedAt,
        cpu: snapshot.cpuUsagePercent,
        mem: snapshot.memoryUsedPercent,
        netIn: snapshot.networkBytesInPerSec,
        netOut: snapshot.networkBytesOutPerSec,
        diskUsedPercent: primaryVolume?.usedPercent ?? null,
        diskPath: primaryVolume?.path ?? null,
      })
      await reconcileAlertsFromSnapshot(snapshot)
    }

    return snapshot
  } finally {
    liveCollecting = false
  }
}

async function maybeCollectStorage(): Promise<void> {
  const now = Date.now()
  if (storageCollecting || now - lastStorageAt < STORAGE_INTERVAL_MS) return
  storageCollecting = true
  try {
    cachedSystemRows = await collectSystemStorageRows()
    lastStorageAt = Date.now()
  } finally {
    storageCollecting = false
  }
}

export function startMonitoringScheduler(): void {
  void collectLiveSnapshot()
  setInterval(() => {
    void collectLiveSnapshot()
  }, LIVE_INTERVAL_MS)

  setInterval(() => {
    void maybeCollectStorage()
  }, STORAGE_INTERVAL_MS)

  void maybeCollectStorage()
}

export function getMonitoringState() {
  return {
    live: latestLive,
    liveCollecting,
    storageCollecting,
    lastStorageAt: lastStorageAt ? new Date(lastStorageAt).toISOString() : null,
  }
}

export async function getLiveMetrics(): Promise<LiveMetricsSnapshot> {
  if (latestLive) return latestLive
  return collectLiveSnapshot()
}

export async function getHistory(range: '24h' | '7d' | '30d') {
  const history = await loadMonitoringHistory()
  return filterHistory(history, range)
}

export async function getSystemStorage() {
  await maybeCollectStorage()
  return cachedSystemRows
}

export async function getAcompDetail(systemId: string) {
  return collectAcompStorageDetail(systemId)
}

export async function getAlerts() {
  return listActiveAlerts()
}

export async function getSettings() {
  return loadMonitoringSettings()
}

export async function updateSettings(input: Partial<import('./types.ts').MonitoringSettings>) {
  const current = await loadMonitoringSettings()
  const next = { ...current, ...input }
  if (next.attentionUsedPercent >= next.criticalUsedPercent) {
    throw new Error('INVALID_THRESHOLDS')
  }
  if (next.criticalUsedPercent >= next.severeUsedPercent) {
    throw new Error('INVALID_THRESHOLDS')
  }
  const { saveMonitoringSettings } = await import('./alertsEngine.ts')
  await saveMonitoringSettings(next)
  return next
}

export async function getAuthUsers(systemId: string, page: number, query?: string) {
  const supa = await readSupabaseStatusJson(systemId)
  if (!supa.status?.API_URL || !supa.status.SERVICE_ROLE_KEY) {
    return {
      ok: false,
      message: supa.detail ?? 'Supabase local indisponível.',
      users: [],
      total: null,
      page,
      pageSize: 25,
      capabilities: { list: false, disable: false, delete: false },
    }
  }
  return listSupabaseAuthUsers(systemId, supa.status, { page, query })
}

export async function disableAuthUser(systemId: string, userId: string) {
  const supa = await readSupabaseStatusJson(systemId)
  if (!supa.status?.API_URL || !supa.status.SERVICE_ROLE_KEY) {
    return { ok: false, message: supa.detail ?? 'Supabase indisponível.' }
  }
  return disableSupabaseAuthUser(systemId, supa.status, userId)
}

export async function deleteAuthUser(systemId: string, userId: string) {
  const supa = await readSupabaseStatusJson(systemId)
  if (!supa.status?.API_URL || !supa.status.SERVICE_ROLE_KEY) {
    return { ok: false, message: supa.detail ?? 'Supabase indisponível.' }
  }
  return deleteSupabaseAuthUser(systemId, supa.status, userId)
}

export async function getDashboardOverview(): Promise<import('./types.ts').DashboardOverviewPayload> {
  const { collectOnlineUsersOverview } = await import('./onlineUsersOverview.ts')
  const { evaluateDashboardOperationalStatus } = await import('./evaluateDashboardOperationalStatus.ts')
  const live = await getLiveMetrics()
  const [onlineUsers, operational] = await Promise.all([
    collectOnlineUsersOverview(),
    evaluateDashboardOperationalStatus(live),
  ])
  return { ok: true, onlineUsers, operational }
}
