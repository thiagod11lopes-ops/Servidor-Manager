import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import {
  applyAccessModeToServidorEnvContent,
  prepareServidorEnv,
} from './prepareServidorEnv.ts'
import type { ServerManifest } from './types.ts'

function readEnvValue(content: string, key: string): string | null {
  const match = new RegExp(`^${key}=(.+)$`, 'm').exec(content)
  return match ? match[1].trim() : null
}

describe('applyAccessModeToServidorEnvContent', () => {
  const base = 'ACOMOPMS_LAN_HOST=auto\nACOMOPMS_HTTP_PORT=8080\n'

  it('modo lan mantém escopo firewall LAN', () => {
    const out = applyAccessModeToServidorEnvContent(base, 'lan')
    assert.equal(readEnvValue(out, 'ACOMOPMS_ACCESS_MODE'), 'lan')
    assert.equal(readEnvValue(out, 'ACOMOPMS_FIREWALL_SCOPE'), 'lan')
  })

  it('modo local usa loopback e remove chaves LAN secundárias', () => {
    const withLan = applyAccessModeToServidorEnvContent(base, 'lan')
    const out = applyAccessModeToServidorEnvContent(withLan, 'local')
    assert.equal(readEnvValue(out, 'ACOMOPMS_ACCESS_MODE'), 'local')
    assert.equal(readEnvValue(out, 'ACOMOPMS_SECONDARY_LAN_REDIRECTS'), null)
  })
})

describe('prepareServidorEnv (integração mínima)', () => {
  let root = ''
  const manifest = {} as ServerManifest

  after(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true })
  })

  it('instalação lan persiste IPv4 LAN e política no disco', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-env-lan-'))
    const lanDir = path.join(root, 'Transferir para Servidor', 'servidor-lan')
    await fs.mkdir(lanDir, { recursive: true })
    await fs.writeFile(
      path.join(lanDir, 'servidor.env.example'),
      '# exemplo\nACOMOPMS_LAN_HOST=auto\nACOMOPMS_HTTP_PORT=8080\n',
      'utf8',
    )

    const result = await prepareServidorEnv({
      rootDirectory: root,
      manifest,
      accessMode: 'lan',
      lanHost: '192.168.50.22',
      httpPort: 8080,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return

    const written = await fs.readFile(result.paths.envPath, 'utf8')
    assert.equal(readEnvValue(written, 'ACOMOPMS_LAN_HOST'), '192.168.50.22')
    assert.equal(readEnvValue(written, 'ACOMOPMS_ACCESS_MODE'), 'lan')
    assert.equal(readEnvValue(written, 'ACOMOPMS_FIREWALL_SCOPE'), 'lan')
  })

  it('instalação local grava 127.0.0.1', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-env-local-'))
    const lanDir = path.join(root, 'Transferir para Servidor', 'servidor-lan')
    await fs.mkdir(lanDir, { recursive: true })
    await fs.writeFile(
      path.join(lanDir, 'servidor.env.example'),
      'ACOMOPMS_LAN_HOST=auto\n',
      'utf8',
    )

    const result = await prepareServidorEnv({
      rootDirectory: root,
      manifest,
      accessMode: 'local',
      lanHost: '127.0.0.1',
      overlayEnabled: false,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return

    const written = await fs.readFile(result.paths.envPath, 'utf8')
    assert.equal(readEnvValue(written, 'ACOMOPMS_LAN_HOST'), '127.0.0.1')
    assert.equal(readEnvValue(written, 'ACOMOPMS_ACCESS_MODE'), 'local')
    assert.equal(readEnvValue(written, 'ACOMOPMS_OVERLAY_ENABLED'), 'false')
  })

  it('modo local rejeita host CGNAT 100.x', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-env-local-ts-'))
    const lanDir = path.join(root, 'Transferir para Servidor', 'servidor-lan')
    await fs.mkdir(lanDir, { recursive: true })
    await fs.writeFile(path.join(lanDir, 'servidor.env.example'), 'ACOMOPMS_LAN_HOST=auto\n', 'utf8')

    const result = await prepareServidorEnv({
      rootDirectory: root,
      manifest,
      accessMode: 'local',
      lanHost: '100.102.248.103',
    })

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.match(result.message, /rede local|loopback|127/i)
  })
})
