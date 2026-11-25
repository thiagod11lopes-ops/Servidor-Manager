import fs from 'node:fs/promises'
import path from 'node:path'
import { monitoringFile } from './paths.ts'
import type { LiveMetricsSnapshot, MonitoringAlert, MonitoringSettings, VolumeStorageSnapshot } from './types.ts'
import { DEFAULT_MONITORING_SETTINGS } from './types.ts'

type AlertsFile = { version: 1; alerts: MonitoringAlert[] }

export async function loadMonitoringSettings(): Promise<MonitoringSettings> {
  try {
    const raw = await fs.readFile(monitoringFile('settings.json'), 'utf8')
    const parsed = JSON.parse(raw) as MonitoringSettings
    return { ...DEFAULT_MONITORING_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_MONITORING_SETTINGS }
  }
}

export async function saveMonitoringSettings(settings: MonitoringSettings): Promise<void> {
  await fs.mkdir(path.dirname(monitoringFile('settings.json')), { recursive: true })
  await fs.writeFile(monitoringFile('settings.json'), JSON.stringify(settings, null, 2), 'utf8')
}

async function loadAlerts(): Promise<AlertsFile> {
  try {
    const raw = await fs.readFile(monitoringFile('alerts.json'), 'utf8')
    const parsed = JSON.parse(raw) as AlertsFile
    if (parsed.version === 1 && Array.isArray(parsed.alerts)) return parsed
  } catch {
    // ignore
  }
  return { version: 1, alerts: [] }
}

async function persistAlerts(file: AlertsFile): Promise<void> {
  await fs.mkdir(path.dirname(monitoringFile('alerts.json')), { recursive: true })
  await fs.writeFile(monitoringFile('alerts.json'), JSON.stringify(file, null, 2), 'utf8')
}

function alertKey(volumePath: string, kind: string): string {
  return `${volumePath}::${kind}`
}

function upsertAlert(
  alerts: MonitoringAlert[],
  id: string,
  input: Omit<MonitoringAlert, 'id' | 'firstSeenAt' | 'lastSeenAt' | 'resolvedAt' | 'active'> & {
    active: boolean
  },
): MonitoringAlert[] {
  const now = new Date().toISOString()
  const existing = alerts.find((a) => a.id === id)
  if (!existing) {
    return [
      ...alerts,
      {
        id,
        ...input,
        firstSeenAt: now,
        lastSeenAt: now,
        resolvedAt: input.active ? null : now,
      },
    ]
  }
  return alerts.map((a) =>
    a.id === id
      ? {
          ...a,
          ...input,
          lastSeenAt: now,
          resolvedAt: input.active ? null : a.resolvedAt ?? now,
        }
      : a,
  )
}

function evaluateVolume(volume: VolumeStorageSnapshot, settings: MonitoringSettings): MonitoringAlert[] {
  const updates: MonitoringAlert[] = []
  const used = volume.usedPercent
  const idBase = alertKey(volume.path, 'capacity')
  if (used == null) {
    updates.push({
      id: `${idBase}::unavailable`,
      severity: 'warning',
      title: 'Coleta de armazenamento indisponível',
      message: volume.detail ?? 'Não foi possível consultar o volume.',
      volumePath: volume.path,
      systemId: null,
      active: true,
      firstSeenAt: '',
      lastSeenAt: '',
      resolvedAt: null,
    })
    return updates
  }

  const levels: Array<{ pct: number; severity: MonitoringAlert['severity']; title: string }> = [
    { pct: settings.severeUsedPercent, severity: 'critical', title: 'Capacidade muito crítica' },
    { pct: settings.criticalUsedPercent, severity: 'critical', title: 'Capacidade crítica' },
    { pct: settings.attentionUsedPercent, severity: 'warning', title: 'Capacidade em atenção' },
  ]

  for (const level of levels) {
    if (used >= level.pct) {
      updates.push({
        id: `${idBase}::${level.pct}`,
        severity: level.severity,
        title: level.title,
        message: `${volume.label}: ${used}% utilizado (${volume.detail ?? ''})`.trim(),
        volumePath: volume.path,
        systemId: null,
        active: true,
        firstSeenAt: '',
        lastSeenAt: '',
        resolvedAt: null,
      })
      break
    }
  }

  if (settings.minFreeBytesWarning != null && volume.availableBytes != null) {
    if (volume.availableBytes <= settings.minFreeBytesWarning) {
      updates.push({
        id: `${idBase}::minfree`,
        severity: 'warning',
        title: 'Espaço livre abaixo do mínimo',
        message: `${volume.label}: ${volume.availableBytes} bytes livres.`,
        volumePath: volume.path,
        systemId: null,
        active: true,
        firstSeenAt: '',
        lastSeenAt: '',
        resolvedAt: null,
      })
    }
  }

  return updates
}

export async function reconcileAlertsFromSnapshot(
  snapshot: LiveMetricsSnapshot,
): Promise<MonitoringAlert[]> {
  const settings = await loadMonitoringSettings()
  const file = await loadAlerts()
  let alerts = file.alerts

  const activeIds = new Set<string>()
  for (const volume of snapshot.volumes) {
    for (const draft of evaluateVolume(volume, settings)) {
      activeIds.add(draft.id)
      alerts = upsertAlert(alerts, draft.id, {
        severity: draft.severity,
        title: draft.title,
        message: draft.message,
        volumePath: draft.volumePath,
        systemId: draft.systemId,
        active: true,
      })
    }
  }

  if (snapshot.collectionError) {
    const id = 'collection::error'
    activeIds.add(id)
    alerts = upsertAlert(alerts, id, {
      severity: 'warning',
      title: 'Coleta de métricas com falha',
      message: snapshot.collectionError,
      volumePath: null,
      systemId: null,
      active: true,
    })
  }

  alerts = alerts.map((a) =>
    a.active && !activeIds.has(a.id) ? { ...a, active: false, resolvedAt: new Date().toISOString() } : a,
  )

  await persistAlerts({ version: 1, alerts })
  return alerts.filter((a) => a.active)
}

export async function listActiveAlerts(): Promise<MonitoringAlert[]> {
  const file = await loadAlerts()
  return file.alerts.filter((a) => a.active)
}
