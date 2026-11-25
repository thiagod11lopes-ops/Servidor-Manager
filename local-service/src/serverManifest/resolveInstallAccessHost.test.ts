import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isPhysicalLanHostForLanMode,
  resolveInstallAccessHostForLanMode,
  resolveInstallAccessHostForLocalMode,
} from './resolveInstallAccessHost.ts'

describe('resolveInstallAccessHostForLocalMode', () => {
  it('usa loopback', () => {
    const result = resolveInstallAccessHostForLocalMode()
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.host, '127.0.0.1')
      assert.equal(result.source, 'loopback')
    }
  })
})

describe('resolveInstallAccessHostForLanMode', () => {
  it('falha quando não há IPv4 LAN física detectável', () => {
    const result = resolveInstallAccessHostForLanMode()
    if (!result.ok) {
      assert.match(result.message, /rede local/i)
    }
  })
})

describe('isPhysicalLanHostForLanMode', () => {
  it('rejeita loopback e CGNAT 100.x', () => {
    assert.equal(isPhysicalLanHostForLanMode('127.0.0.1'), false)
    assert.equal(isPhysicalLanHostForLanMode('100.102.1.1'), false)
    assert.equal(isPhysicalLanHostForLanMode('host.ts.net'), false)
  })

  it('aceita RFC1918', () => {
    assert.equal(isPhysicalLanHostForLanMode('192.168.1.10'), true)
  })
})
