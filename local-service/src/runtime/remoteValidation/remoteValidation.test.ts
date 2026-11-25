import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { beginRemoteValidationSession } from './beginRemoteValidationSession.ts'
import { resetRemoteValidationSessionStoreForTests } from './sessionStore.ts'
import { resetOperationalExternalProbeStoreForTests } from './operationalReportStore.ts'
import type { RuntimeStateSnapshot } from '../types.ts'

function baseStatus(overrides: Partial<RuntimeStateSnapshot> = {}): RuntimeStateSnapshot {
  return {
    systemId: '00000000-0000-4000-8000-000000000001',
    state: 'executando',
    pid: 1,
    startedAt: null,
    stoppedAt: null,
    uptimeSeconds: null,
    port: 8080,
    workingDirectory: 'C:\\ServidorManager\\systems\\test',
    startCommand: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
    loginUrl: 'http://192.168.0.10:8080/login',
    runtimeKind: 'manifest-lan',
    caddyRunning: true,
    ...overrides,
  }
}

describe('remote validation session', () => {
  beforeEach(() => {
    resetRemoteValidationSessionStoreForTests()
    resetOperationalExternalProbeStoreForTests()
  })

  it('não inicia sessão sem candidato remoto (VPN removida)', () => {
    const started = beginRemoteValidationSession(baseStatus())
    assert.equal(started.ok, false)
    if (started.ok) return
    assert.equal(started.reason, 'NO_ACTIVE_CANDIDATE')
  })
})
