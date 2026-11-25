import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ProbeLocalHttpUrlResult } from '../network/probeLocalHttpUrl.ts'
import { verifyManifestLanReadiness } from './verifyManifestLanReadiness.ts'

function okProbe(status = 200): ProbeLocalHttpUrlResult {
  return { ok: true, responded: true, status, finalUrl: 'http://127.0.0.1/' }
}

function failProbe(message: string): ProbeLocalHttpUrlResult {
  return { ok: false, responded: false, reason: 'TRANSPORT_ERROR', message }
}

describe('verifyManifestLanReadiness', () => {
  it('ok quando Kong, login e server-connection respondem', async () => {
    const result = await verifyManifestLanReadiness(8080, async (url) => {
      if (url.includes('54321')) return okProbe(200)
      if (url.includes('/login')) return okProbe(200)
      if (url.includes('server-connection')) return okProbe(200)
      return failProbe('unexpected')
    })
    assert.equal(result.ok, true)
    assert.equal(result.checks.length, 3)
  })

  it('falha quando login indisponível', async () => {
    const result = await verifyManifestLanReadiness(9090, async (url) => {
      if (url.includes('54321')) return okProbe(200)
      if (url.includes('/login')) return failProbe('ECONNREFUSED')
      if (url.includes('server-connection')) return okProbe(200)
      return failProbe('unexpected')
    })
    assert.equal(result.ok, false)
    assert.match(result.message, /caddy\.login/i)
  })
})
