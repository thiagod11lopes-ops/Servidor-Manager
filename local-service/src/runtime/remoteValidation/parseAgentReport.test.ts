import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseAgentReportPayload } from './parseAgentReport.ts'

describe('parseAgentReportPayload', () => {
  it('aceita envelope ingest do agente', () => {
    const parsed = parseAgentReportPayload({
      kind: 'servidor-manager-remote-validation-report',
      ingest: {
        systemId: 'abc',
        sessionToken: 'tok',
        nonce: 'n',
        probeUrlHash: 'a'.repeat(64),
        responded: true,
        httpStatus: 200,
      },
    })
    assert.ok(parsed)
    assert.equal(parsed?.httpStatus, 200)
  })

  it('rejeita payload incompleto', () => {
    assert.equal(parseAgentReportPayload({ ingest: { systemId: 'x' } }), null)
  })
})
