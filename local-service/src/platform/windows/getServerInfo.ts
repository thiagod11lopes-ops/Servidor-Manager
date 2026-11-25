import { statfs } from 'node:fs/promises'
import os from 'node:os'
import { formatBytes } from '../../utils/formatBytes.ts'

function resolveWindowsDrive(): string {
  const drive = process.env.SystemDrive
  if (drive && /^[A-Za-z]:$/.test(drive)) return `${drive}\\`
  return 'C:\\'
}

function formatOperatingSystem(): string {
  return os.version?.() ?? `Windows ${os.release()}`
}

export async function getWindowsServerInfo() {
  const memoryTotalBytes = os.totalmem()
  const memoryFreeBytes = os.freemem()
  const storagePath = resolveWindowsDrive()
  const storageStats = await statfs(storagePath)

  const storageTotalBytes = storageStats.bsize * storageStats.blocks
  const storageAvailableBytes = storageStats.bsize * storageStats.bavail

  return {
    source: 'local-service' as const,
    operatingSystem: formatOperatingSystem(),
    computerName: os.hostname(),
    cpuCount: os.cpus().length,
    memoryTotalBytes,
    memoryFreeBytes,
    memoryTotalLabel: formatBytes(memoryTotalBytes),
    memoryFreeLabel: formatBytes(memoryFreeBytes),
    storagePath,
    storageTotalBytes,
    storageAvailableBytes,
    storageTotalLabel: formatBytes(storageTotalBytes),
    storageAvailableLabel: formatBytes(storageAvailableBytes),
  }
}
