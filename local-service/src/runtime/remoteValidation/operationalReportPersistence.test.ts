import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EXTERNAL_PROBE_REPORT_VERSION,
  parsePersistedExternalProbeReport,
  serializePersistedExternalProbeReport,
} from './operationalReportPersistence.ts'

const SYSTEM_ID = '00000000-0000-4000-8000-000000000001'
const HASH = 'a'.repeat(64)

describe('operationalReportPersistence', () => {
  it('parse aceita relatório válido sem segredos', () => {
    const parsed = parsePersistedExternalProbeReport(
      {
        version: EXTERNAL_PROBE_REPORT_VERSION,
        systemId: SYSTEM_ID,
        candidateUrlHash: HASH,
        trustLevel: 'session_binding_only',
        responded: true,
        httpStatus: 200,
        acceptedAt: '2026-01-01T00:00:00.000Z',
      },
      SYSTEM_ID,
    )
    assert.ok(parsed)
    assert.equal(parsed?.systemId, SYSTEM_ID)
    assert.equal(parsed?.httpStatus, 200)
  })

  it('parse rejeita systemId divergente ou JSON corrompido', () => {
    assert.equal(
      parsePersistedExternalProbeReport(
        {
          version: EXTERNAL_PROBE_REPORT_VERSION,
          systemId: SYSTEM_ID,
          candidateUrlHash: HASH,
          trustLevel: 'session_binding_only',
          responded: true,
          httpStatus: 200,
          acceptedAt: '2026-01-01T00:00:00.000Z',
        },
        '00000000-0000-4000-8000-000000000099',
      ),
      null,
    )
    assert.equal(parsePersistedExternalProbeReport(null, SYSTEM_ID), null)
    assert.equal(parsePersistedExternalProbeReport({ version: 99 }, SYSTEM_ID), null)
  })

  it('serialize não inclui campos extra', () => {
    const serialized = serializePersistedExternalProbeReport({
      systemId: SYSTEM_ID,
      candidateUrlHash: HASH,
      trustLevel: 'session_binding_only',
      responded: false,
      acceptedAt: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(serialized.version, EXTERNAL_PROBE_REPORT_VERSION)
    assert.equal('httpStatus' in serialized, false)
  })
})
