import {
  deleteExternalProbeReportFromDisk,
  readExternalProbeReportFromDisk,
  writeExternalProbeReportToDisk,
} from './operationalReportPersistence.ts'

export type StoredExternalProbeReport = {
  systemId: string
  candidateUrlHash: string
  trustLevel: 'session_binding_only'
  responded: boolean
  httpStatus?: number
  acceptedAt: string
}

const reportsBySystemId = new Map<string, StoredExternalProbeReport>()

export function saveOperationalExternalProbeReport(report: StoredExternalProbeReport): void {
  reportsBySystemId.set(report.systemId, report)
  writeExternalProbeReportToDisk(report)
}

export function getOperationalExternalProbeReport(
  systemId: string,
): StoredExternalProbeReport | null {
  const cached = reportsBySystemId.get(systemId)
  if (cached) return cached

  const fromDisk = readExternalProbeReportFromDisk(systemId)
  if (fromDisk) {
    reportsBySystemId.set(systemId, fromDisk)
    return fromDisk
  }
  return null
}

export function clearOperationalExternalProbeReport(systemId: string): void {
  reportsBySystemId.delete(systemId)
  deleteExternalProbeReportFromDisk(systemId)
}

export function resetOperationalExternalProbeStoreForTests(): void {
  for (const systemId of reportsBySystemId.keys()) {
    deleteExternalProbeReportFromDisk(systemId)
  }
  reportsBySystemId.clear()
}
