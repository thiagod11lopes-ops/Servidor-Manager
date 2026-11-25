import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildServerOperationalChecklist } from './serverOperationalChecklist.ts'
import type { ManagedSystem } from '../types/system.ts'

function baseSystem(overrides: Partial<ManagedSystem> = {}): ManagedSystem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'AcompSolemp',
    url: 'https://github.com/org/AcompSolemp/tree/main',
    status: 'instalado',
    technology: 'analisada',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('buildServerOperationalChecklist', () => {
  it('nao marca pronto LAN com bootstrap pendente', () => {
    const result = buildServerOperationalChecklist({
      bootstrapLoading: false,
      bootstrapStatus: {
        ok: false,
        readyForManifestInstall: false,
        platform: 'windows',
        os: { label: 'Windows' },
        isAdmin: true,
        wingetAvailable: true,
        wsl: { available: true, detail: '' },
        docker: { installed: true, running: true, detail: '' },
        dependencies: [],
        toolchain: { ok: false, checked: [], missing: [] },
        hints: [],
        bootstrapScriptAvailable: true,
        summary: 'Pendente',
      },
      system: baseSystem(),
      runtimeStatus: {
        systemId: baseSystem().id,
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
        localHttpReachable: true,
        localHttpStatus: 200,
      },
    })
    assert.equal(result.lanEssentialsReady, false)
  })

  it('marca pronto LAN quando essenciais ok', () => {
    const result = buildServerOperationalChecklist({
      bootstrapLoading: false,
      bootstrapStatus: {
        ok: true,
        readyForManifestInstall: true,
        platform: 'windows',
        os: { label: 'Windows' },
        isAdmin: true,
        wingetAvailable: true,
        wsl: { available: true, detail: '' },
        docker: { installed: true, running: true, detail: '' },
        dependencies: [],
        toolchain: { ok: true, checked: [], missing: [] },
        hints: [],
        bootstrapScriptAvailable: true,
        summary: 'OK',
      },
      system: baseSystem(),
      runtimeStatus: {
        systemId: baseSystem().id,
        accessMode: 'lan',
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
        lanAccessUrl: 'http://192.168.0.1:8080/login',
        localHttpReachable: true,
      },
    })
    assert.equal(result.lanEssentialsReady, true)
    const lanItem = result.items.find((i) => i.id === 'lan_share')
    assert.equal(lanItem?.status, 'done')
  })

  it('marca falha quando URL legada CGNAT ainda aparece no runtime', () => {
    const result = buildServerOperationalChecklist({
      bootstrapLoading: false,
      bootstrapStatus: {
        ok: true,
        readyForManifestInstall: true,
        platform: 'windows',
        os: { label: 'Windows' },
        isAdmin: true,
        wingetAvailable: true,
        wsl: { available: true, detail: '' },
        docker: { installed: true, running: true, detail: '' },
        dependencies: [],
        toolchain: { ok: true, checked: [], missing: [] },
        hints: [],
        bootstrapScriptAvailable: true,
        summary: 'OK',
      },
      system: baseSystem(),
      runtimeStatus: {
        systemId: baseSystem().id,
        accessMode: 'lan',
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
        lanAccessUrl: 'http://100.102.248.103:4173/login',
        runtimeKind: 'manifest-lan',
        caddyRunning: true,
      },
    })
    const lanItem = result.items.find((i) => i.id === 'lan_share')
    assert.equal(lanItem?.status, 'failed')
    assert.match(lanItem?.detail ?? '', /CGNAT|rede virtual|legado/i)
  })
})
