import { hashRemoteCandidateUrl } from './candidateUrlHash.ts'
import {
  clearOperationalExternalProbeReport,
  getOperationalExternalProbeReport,
} from './operationalReportStore.ts'
import type { SystemRemoteAccess } from '../types.ts'

const TRUST_SUMMARY_HTTP =
  'Relatório externo recebido (vínculo de sessão). A execução do probe no outro dispositivo não foi verificada criptograficamente.'

const TRUST_SUMMARY_TRANSPORT =
  'Relatório externo: falha de transporte observada pelo agente (vínculo de sessão). Execução do probe não verificada criptograficamente.'

export function applyOperationalExternalReport(
  remoteAccess: SystemRemoteAccess,
  systemId: string,
): SystemRemoteAccess {
  const report = getOperationalExternalProbeReport(systemId)
  if (!report) return remoteAccess

  const liveHash = hashRemoteCandidateUrl(remoteAccess.candidateUrl)
  if (report.candidateUrlHash !== liveHash) {
    clearOperationalExternalProbeReport(systemId)
    return remoteAccess
  }

  return {
    ...remoteAccess,
    remoteValidated: false,
    remoteValidationState: report.responded ? 'external_report_received' : 'external_probe_failed',
    remoteValidationSummary: report.responded ? TRUST_SUMMARY_HTTP : TRUST_SUMMARY_TRANSPORT,
    externalProbeTrustLevel: report.trustLevel,
    externalProbeAcceptedAt: report.acceptedAt,
    externalProbeHttpStatus: report.httpStatus,
  }
}
