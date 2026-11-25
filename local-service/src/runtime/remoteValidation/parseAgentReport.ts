import type { RemoteValidationReportInput } from './types.ts'

export function parseAgentReportPayload(body: unknown): RemoteValidationReportInput | null {
  if (!body || typeof body !== 'object') return null

  const root = body as Record<string, unknown>
  const candidate = root.ingest ?? root.report ?? root

  if (!candidate || typeof candidate !== 'object') return null

  const report = candidate as Record<string, unknown>
  if (typeof report.systemId !== 'string') return null
  if (typeof report.sessionToken !== 'string') return null
  if (typeof report.nonce !== 'string') return null
  if (typeof report.probeUrlHash !== 'string') return null
  if (typeof report.responded !== 'boolean') return null

  return {
    systemId: report.systemId,
    sessionToken: report.sessionToken,
    nonce: report.nonce,
    probeUrlHash: report.probeUrlHash,
    responded: report.responded,
    httpStatus: typeof report.httpStatus === 'number' ? report.httpStatus : undefined,
    reportedAt: typeof report.reportedAt === 'string' ? report.reportedAt : undefined,
  }
}
