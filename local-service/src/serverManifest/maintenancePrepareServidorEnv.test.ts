import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildUpdatePrepareServidorEnvInput } from './maintenancePrepareServidorEnv.ts'

describe('buildUpdatePrepareServidorEnvInput', () => {
  it('modo local grava loopback e preserva porta do env', async () => {
    const env = 'ACOMOPMS_LAN_HOST=192.168.0.44\nACOMOPMS_HTTP_PORT=8080\n'

    const result = await buildUpdatePrepareServidorEnvInput({
      accessMode: 'local',
      existingEnvContent: env,
      manifestHttpPort: 9090,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.input.accessMode, 'local')
    assert.equal(result.input.lanHost, '127.0.0.1')
    assert.equal(result.input.httpPort, 8080)
    assert.equal(result.input.overlayEnabled, false)
  })

  it('modo lan resolve IPv4 física ou falha', async () => {
    const env = 'ACOMOPMS_HTTP_PORT=8080\n'

    const result = await buildUpdatePrepareServidorEnvInput({
      accessMode: 'lan',
      existingEnvContent: env,
      manifestHttpPort: 8080,
    })

    if (result.ok) {
      assert.equal(result.input.accessMode, 'lan')
      assert.match(result.input.lanHost ?? '', /^\d+\.\d+\.\d+\.\d+$/)
    } else {
      assert.match(result.message, /LAN/i)
    }
  })
})
