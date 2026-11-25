/**
 * Garante que vite.config.ts usa as mesmas regras de path que o guard de producao.
 * Nao sobe servidor Vite — apenas compara fontes (dev/preview proxy).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { isLocalhostOnlyProxyPath } from './manager-localhost-only-guard.mjs'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteConfig = fs.readFileSync(path.join(repoRoot, 'vite.config.ts'), 'utf8')

describe('vite.config.ts alinhado ao guard de producao', () => {
  it('referencia regex remote-validation e loopback guard', () => {
    assert.ok(viteConfig.includes('remote-validation'))
    assert.ok(viteConfig.includes('isLoopbackRemoteAddress'))
    assert.ok(viteConfig.includes('FORBIDDEN'))
  })

  it('mesmas paths protegidas que manager-localhost-only-guard.mjs', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const samples = [
      `/api/v1/systems/${id}/remote-validation/session`,
      `/api/v1/systems/${id}/remote-validation/report`,
    ]
    for (const p of samples) {
      assert.equal(isLocalhostOnlyProxyPath(p), true, p)
    }
    assert.equal(isLocalhostOnlyProxyPath(`/api/v1/systems/${id}/status`), false)
    assert.equal(isLocalhostOnlyProxyPath('/api/v1/network/tailscale/status'), false)
  })
})
