import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveRemoteValidationDisplay } from './systemRemoteValidationDisplay.ts'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'

function baseStatus(): SystemRuntimeStatus {
  return {
    systemId: '11111111-1111-4111-8111-111111111111',
    state: 'executando',
    pid: 1,
    startedAt: null,
    stoppedAt: null,
    uptimeSeconds: 1,
    port: 8080,
    workingDirectory: 'C:\\test',
    startCommand: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  }
}

describe('resolveRemoteValidationDisplay', () => {
  it('sempre not_applicable após remoção de VPN', () => {
    const display = resolveRemoteValidationDisplay(baseStatus())
    assert.equal(display.state, 'not_applicable')
    assert.match(display.summary, /LAN/i)
  })
})
