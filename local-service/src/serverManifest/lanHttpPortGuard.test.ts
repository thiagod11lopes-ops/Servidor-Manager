import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isLoopbackTcpPortOpen } from './lanHttpPortGuard.ts'

describe('isLoopbackTcpPortOpen', () => {
  it('retorna boolean sem lançar (porta provavelmente livre ou ocupada)', async () => {
    const result = await isLoopbackTcpPortOpen(59123)
    assert.equal(typeof result, 'boolean')
  })
})
