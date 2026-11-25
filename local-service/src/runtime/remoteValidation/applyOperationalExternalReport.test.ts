import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { applyOperationalExternalReport } from './applyOperationalExternalReport.ts'
import { hashRemoteCandidateUrl } from './candidateUrlHash.ts'
import {
  resetOperationalExternalProbeStoreForTests,
  saveOperationalExternalProbeReport,
} from './operationalReportStore.ts'
import type { SystemRemoteAccess } from '../types.ts'

const baseRemote: SystemRemoteAccess = {
  candidateUrl: 'http://100.64.0.8:8080/login',
  basis: 'loginUrl',
  remoteValidated: false,
  summary: 'x',
  remoteValidationState: 'needs_external_probe',
}

describe('applyOperationalExternalReport', () => {
  beforeEach(() => {
    resetOperationalExternalProbeStoreForTests()
  })

  it('mantem remoteValidated false com relatório recebido', () => {
    const hash = hashRemoteCandidateUrl(baseRemote.candidateUrl)
    saveOperationalExternalProbeReport({
      systemId: 'sys-1',
      candidateUrlHash: hash,
      trustLevel: 'session_binding_only',
      responded: true,
      httpStatus: 503,
      acceptedAt: '2026-01-01T00:00:00.000Z',
    })
    const applied = applyOperationalExternalReport(baseRemote, 'sys-1')
    assert.equal(applied.remoteValidated, false)
    assert.equal(applied.remoteValidationState, 'external_report_received')
    assert.equal(applied.externalProbeHttpStatus, 503)
  })

  it('descarta relatório se candidato mudou', () => {
    saveOperationalExternalProbeReport({
      systemId: 'sys-1',
      candidateUrlHash: 'b'.repeat(64),
      trustLevel: 'session_binding_only',
      responded: true,
      httpStatus: 200,
      acceptedAt: '2026-01-01T00:00:00.000Z',
    })
    const applied = applyOperationalExternalReport(baseRemote, 'sys-1')
    assert.equal(applied.remoteValidationState, 'needs_external_probe')
  })
})
