import { statfs } from 'node:fs/promises'
import path from 'node:path'
import { getSystemsRoot } from '../installation/paths.ts'
import { formatBytes } from './format.ts'
import type { CapacityState, MetricAvailability, MonitoringSettings, VolumeStorageSnapshot } from './types.ts'
import { DEFAULT_MONITORING_SETTINGS } from './types.ts'

function resolveWindowsDrive(): string {
  const drive = process.env.SystemDrive
  if (drive && /^[A-Za-z]:$/.test(drive)) return `${drive}\\`
  return 'C:\\'
}

export function capacityStateForUsedPercent(
  usedPercent: number | null,
  settings: MonitoringSettings = DEFAULT_MONITORING_SETTINGS,
): CapacityState {
  if (usedPercent == null || Number.isNaN(usedPercent)) return 'unknown'
  if (usedPercent >= settings.severeUsedPercent) return 'severe'
  if (usedPercent >= settings.criticalUsedPercent) return 'critical'
  if (usedPercent >= settings.attentionUsedPercent) return 'attention'
  return 'normal'
}

async function statVolume(targetPath: string, label: string): Promise<VolumeStorageSnapshot> {
  const collectedAt = new Date().toISOString()
  try {
    const stats = await statfs(targetPath)
    const totalBytes = stats.bsize * stats.blocks
    const availableBytes = stats.bsize * stats.bavail
    if (totalBytes <= 0) {
      return {
        path: targetPath,
        label,
        totalBytes: null,
        availableBytes: null,
        usedBytes: null,
        usedPercent: null,
        capacityState: 'unknown',
        availability: 'unavailable',
        detail: 'Tamanho total do volume inválido.',
        collectedAt,
      }
    }
    const usedBytes = totalBytes - availableBytes
    const usedPercent = Math.round((usedBytes / totalBytes) * 100)
    return {
      path: targetPath,
      label,
      totalBytes,
      availableBytes,
      usedBytes,
      usedPercent,
      capacityState: capacityStateForUsedPercent(usedPercent),
      availability: 'measured',
      detail: `${formatBytes(usedBytes)} usados · ${formatBytes(availableBytes)} disponíveis de ${formatBytes(totalBytes)}`,
      collectedAt,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      path: targetPath,
      label,
      totalBytes: null,
      availableBytes: null,
      usedBytes: null,
      usedPercent: null,
      capacityState: 'unknown',
      availability: 'unavailable',
      detail: `Não foi possível consultar: ${message}`,
      collectedAt,
    }
  }
}

export async function collectVolumeSnapshots(): Promise<VolumeStorageSnapshot[]> {
  const volumes: VolumeStorageSnapshot[] = []
  volumes.push(await statVolume(resolveWindowsDrive(), 'Unidade do sistema (Windows)'))
  const systemsRoot = path.resolve(getSystemsRoot())
  const systemsDrive = `${systemsRoot.slice(0, 2)}\\`
  if (systemsDrive.toUpperCase() !== volumes[0]?.path.toUpperCase()) {
    volumes.push(await statVolume(systemsDrive, 'Unidade dos dados (ServidorManager)'))
  }
  return volumes
}
