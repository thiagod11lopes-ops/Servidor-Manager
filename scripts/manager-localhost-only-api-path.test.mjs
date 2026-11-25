import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isLocalhostOnlyProxyPath, isLoopbackRemoteAddress } from './manager-localhost-only-guard.mjs'

describe('manager localhost-only API paths (guard compartilhado)', () => {
  it('inclui remote-validation session/report', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    assert.equal(
      isLocalhostOnlyProxyPath(`/api/v1/systems/${id}/remote-validation/session`),
      true,
    )
    assert.equal(
      isLocalhostOnlyProxyPath(`/api/v1/systems/${id}/remote-validation/report`),
      true,
    )
  })

  it('nao inclui status generico do sistema', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    assert.equal(isLocalhostOnlyProxyPath(`/api/v1/systems/${id}/status`), false)
    assert.equal(isLocalhostOnlyProxyPath('/api/v1/network/tailscale/status'), false)
  })

  it('reconhece enderecos loopback do socket', () => {
    assert.equal(isLoopbackRemoteAddress('127.0.0.1'), true)
    assert.equal(isLoopbackRemoteAddress('::1'), true)
    assert.equal(isLoopbackRemoteAddress('::ffff:127.0.0.1'), true)
    assert.equal(isLoopbackRemoteAddress('192.168.1.10'), false)
    assert.equal(isLoopbackRemoteAddress('10.0.0.5'), false)
  })
})
