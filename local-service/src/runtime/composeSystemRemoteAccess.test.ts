import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { composeSystemRemoteAccess } from './composeSystemRemoteAccess.ts'
import type { RuntimeStateSnapshot } from './types.ts'

function baseStatus(overrides: Partial<RuntimeStateSnapshot> = {}): RuntimeStateSnapshot {
  return {
    systemId: 'test-system',
    state: 'executando',
    pid: 1,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    uptimeSeconds: 10,
    port: 8080,
    workingDirectory: 'C:\\ServidorManager\\systems\\test',
    startCommand: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
    loginUrl: 'http://127.0.0.1:8080/login',
    runtimeKind: 'manifest-lan',
    caddyRunning: true,
    ...overrides,
  }
}

describe('composeSystemRemoteAccess', () => {
  it('não gera candidato remoto (integração VPN removida)', () => {
    const result = composeSystemRemoteAccess(baseStatus())
    assert.equal(result, null)
  })
})
