import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateServerConnectionForFixedLanContract } from './validateServerConnectionDocument.ts'

const expected = { host: '192.168.1.100', port: 8080 }

function validDoc(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'acomopms-server-connection/1',
    lan: {
      host: '192.168.1.100',
      httpPort: 8080,
      origin: 'http://192.168.1.100:8080',
      loginUrl: 'http://192.168.1.100:8080/login',
      ...overrides,
    },
  }
}

describe('validateServerConnectionForFixedLanContract', () => {
  it('aceita documento alinhado ao contrato', () => {
    const result = validateServerConnectionForFixedLanContract(validDoc(), expected)
    assert.equal(result.ok, true)
  })

  it('reprova host ou porta incorretos', () => {
    const badHost = validateServerConnectionForFixedLanContract(
      validDoc({ host: '192.168.1.50' }),
      expected,
    )
    assert.equal(badHost.ok, false)

    const badPort = validateServerConnectionForFixedLanContract(validDoc({ httpPort: 8081 }), expected)
    assert.equal(badPort.ok, false)
  })

  it('reprova schema inválido', () => {
    const result = validateServerConnectionForFixedLanContract({ schema: 'wrong/1', lan: {} }, expected)
    assert.equal(result.ok, false)
  })
})
