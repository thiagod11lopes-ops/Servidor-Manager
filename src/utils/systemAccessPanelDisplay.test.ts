import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildSystemAccessPanelView,
  isUserFacingAccessActive,
  resolveShareableLanUrl,
  resolveUserFacingAccessDisplay,
} from './systemAccessPanelDisplay.ts'
import type { SystemRuntimeStatus } from '../types/systemRuntime.ts'

const baseStatus: SystemRuntimeStatus = {
  systemId: '11111111-1111-4111-8111-111111111111',
  accessMode: 'lan',
  state: 'executando',
  pid: 1,
  startedAt: null,
  stoppedAt: null,
  uptimeSeconds: 10,
  port: 8080,
  workingDirectory: 'C:\\test',
  startCommand: null,
  lastError: null,
  updatedAt: new Date().toISOString(),
  lanAccessUrl: 'http://192.168.0.10:8080/login',
  localHttpReachable: true,
  runtimeKind: 'manifest-lan',
  caddyRunning: true,
}

test('manifest LAN access inactive when Caddy is down', () => {
  const status: SystemRuntimeStatus = {
    ...baseStatus,
    state: 'parado',
    caddyRunning: false,
    lanAccessUrl: null,
    loginUrl: 'http://192.168.0.10:8080/login',
  }
  assert.equal(isUserFacingAccessActive(status), false)
  const display = resolveUserFacingAccessDisplay(status)
  assert.equal(display.url, status.loginUrl)
  assert.equal(display.active, false)
  assert.equal(display.statusLabel, 'Parado')
})

test('descarta URL CGNAT/preview legada na barra de acesso', () => {
  const status: SystemRuntimeStatus = {
    ...baseStatus,
    state: 'parado',
    caddyRunning: false,
    port: 4173,
    loginUrl: 'http://100.102.248.103:4173/login',
    lanAccessUrl: 'http://100.102.248.103:4173/login',
  }
  const display = resolveUserFacingAccessDisplay(status)
  assert.equal(display.url, null)
  assert.equal(display.statusLabel, 'Parado')
  assert.match(display.hint ?? '', /Inicie|8080/i)
})

test('resolveShareableLanUrl rejects loopback', () => {
  assert.equal(resolveShareableLanUrl({ ...baseStatus, lanAccessUrl: 'http://127.0.0.1:8080/' }), null)
  assert.equal(resolveShareableLanUrl(baseStatus), 'http://192.168.0.10:8080/login')
})

test('modo lan exibe URL compartilhável quando Caddy responde', () => {
  const view = buildSystemAccessPanelView({
    accessMode: 'lan',
    runtimeStatus: baseStatus,
  })
  assert.equal(view.shareUrl, 'http://192.168.0.10:8080/login')
  assert.match(view.modeLabel ?? '', /LAN|Rede local/i)
})
