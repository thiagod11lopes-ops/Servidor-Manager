import fs from 'node:fs'
import path from 'node:path'
import { assertValidSystemId, getSystemRoot } from '../../installation/paths.ts'
import type { StoredExternalProbeReport } from './operationalReportStore.ts'

export const EXTERNAL_PROBE_REPORT_FILE = 'external-probe-report.json'
export const EXTERNAL_PROBE_REPORT_VERSION = 1 as const

export type PersistedExternalProbeReportFile = {
  version: typeof EXTERNAL_PROBE_REPORT_VERSION
  systemId: string
  candidateUrlHash: string
  trustLevel: 'session_binding_only'
  responded: boolean
  httpStatus?: number
  acceptedAt: string
}

export function getExternalProbeReportPath(systemId: string): string | null {
  try {
    assertValidSystemId(systemId)
    return path.join(getSystemRoot(systemId), 'config', EXTERNAL_PROBE_REPORT_FILE)
  } catch {
    return null
  }
}

export function parsePersistedExternalProbeReport(
  raw: unknown,
  expectedSystemId: string,
): StoredExternalProbeReport | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Partial<PersistedExternalProbeReportFile>
  if (record.version !== EXTERNAL_PROBE_REPORT_VERSION) return null
  if (typeof record.systemId !== 'string' || record.systemId.trim() !== expectedSystemId) return null
  if (record.trustLevel !== 'session_binding_only') return null
  if (typeof record.candidateUrlHash !== 'string' || !/^[a-f0-9]{64}$/i.test(record.candidateUrlHash.trim())) {
    return null
  }
  if (typeof record.responded !== 'boolean') return null
  if (typeof record.acceptedAt !== 'string' || !record.acceptedAt.trim()) return null
  if (record.responded) {
    if (typeof record.httpStatus !== 'number' || !Number.isInteger(record.httpStatus)) return null
    if (record.httpStatus < 100 || record.httpStatus > 599) return null
  } else if (record.httpStatus != null) {
    return null
  }

  return {
    systemId: expectedSystemId,
    candidateUrlHash: record.candidateUrlHash.trim().toLowerCase(),
    trustLevel: 'session_binding_only',
    responded: record.responded,
    httpStatus: record.responded ? record.httpStatus : undefined,
    acceptedAt: record.acceptedAt.trim(),
  }
}

export function serializePersistedExternalProbeReport(
  report: StoredExternalProbeReport,
): PersistedExternalProbeReportFile {
  const payload: PersistedExternalProbeReportFile = {
    version: EXTERNAL_PROBE_REPORT_VERSION,
    systemId: report.systemId,
    candidateUrlHash: report.candidateUrlHash.trim().toLowerCase(),
    trustLevel: 'session_binding_only',
    responded: report.responded,
    acceptedAt: report.acceptedAt,
  }
  if (report.responded && report.httpStatus != null) {
    payload.httpStatus = report.httpStatus
  }
  return payload
}

export function readExternalProbeReportFromDisk(systemId: string): StoredExternalProbeReport | null {
  const configPath = getExternalProbeReportPath(systemId)
  if (!configPath) return null
  try {
    if (!fs.existsSync(configPath)) return null
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown
    return parsePersistedExternalProbeReport(parsed, systemId)
  } catch {
    return null
  }
}

export function writeExternalProbeReportToDisk(report: StoredExternalProbeReport): void {
  const configPath = getExternalProbeReportPath(report.systemId)
  if (!configPath) return
  const configDir = path.dirname(configPath)
  try {
    fs.mkdirSync(configDir, { recursive: true })
    const tempPath = `${configPath}.tmp`
    fs.writeFileSync(
      tempPath,
      `${JSON.stringify(serializePersistedExternalProbeReport(report), null, 2)}\n`,
      'utf8',
    )
    fs.renameSync(tempPath, configPath)
  } catch {
    // Falha de disco não impede o Manager; o cache em memória ainda reflete a sessão actual.
  }
}

export function deleteExternalProbeReportFromDisk(systemId: string): void {
  const configPath = getExternalProbeReportPath(systemId)
  if (!configPath) return
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath)
    }
  } catch {
    // Ignorar — estado em memória já foi limpo.
  }
}
