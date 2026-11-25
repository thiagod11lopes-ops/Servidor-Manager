import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isFixedLanPort8080LifecycleFailure } from './fixedLanPort8080Runtime.ts'

describe('isFixedLanPort8080LifecycleFailure', () => {
  it('detecta código estruturado de conflito', () => {
    assert.equal(
      isFixedLanPort8080LifecycleFailure({
        ok: false,
        message: 'x',
        code: 'FIXED_LAN_HTTP_PORT_CONFLICT',
      }),
      true,
    )
  })

  it('não trata sucesso como conflito', () => {
    assert.equal(isFixedLanPort8080LifecycleFailure({ ok: true, message: 'ok' }), false)
  })
})
