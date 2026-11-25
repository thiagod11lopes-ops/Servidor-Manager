import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  OMPS_LAN_DISCOVERY_UDP_PORT,
  buildOmpsLanDiscoveryRequestBuffer,
  buildOmpsLanDiscoveryResponseBuffer,
  parseOmpsLanDiscoveryRequest,
  parseOmpsLanDiscoveryResponse,
} from './ompsLanDiscoveryProtocol.ts'

describe('ompsLanDiscoveryProtocol', () => {
  it('porta UDP documentada', () => {
    assert.equal(OMPS_LAN_DISCOVERY_UDP_PORT, 47_808)
  })

  it('valida pedido e resposta', () => {
    const req = parseOmpsLanDiscoveryRequest(JSON.parse(buildOmpsLanDiscoveryRequestBuffer().toString('utf8')))
    assert.equal(req.ok, true)
    const buf = buildOmpsLanDiscoveryResponseBuffer({
      host: '10.0.0.8',
      httpPort: 8080,
      entryPath: '/login',
      instanceId: 'abc',
    })
    const res = parseOmpsLanDiscoveryResponse(JSON.parse(buf.toString('utf8')))
    assert.equal(res.ok, true)
    if (res.ok) {
      assert.equal(res.value.loginUrl, 'http://10.0.0.8:8080/login')
    }
  })
})
