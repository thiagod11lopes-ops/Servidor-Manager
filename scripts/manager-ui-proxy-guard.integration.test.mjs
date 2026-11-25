/**
 * Integração do proxy de produção (serve-manager-ui.mjs).
 *
 * Limitação explícita: usa conexão TCP ao bind 0.0.0.0 via IP LAN local para simular
 * cliente não-loopback no MESMO host. Não substitui teste com segundo computador (Etapa 13).
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, before, after } from 'node:test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SYSTEM_ID = '00000000-0000-4000-8000-000000000001'

function pickNonLoopbackHost() {
  const nets = os.networkInterfaces()
  for (const entries of Object.values(nets)) {
    if (!entries) continue
    for (const entry of entries) {
      if (entry.internal || entry.family !== 'IPv4') continue
      if (entry.address.startsWith('169.254.')) continue
      return entry.address
    }
  }
  return null
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let body
        try {
          body = JSON.parse(text)
        } catch {
          body = text
        }
        resolve({ status: res.statusCode, body })
      })
    })
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

function startMockLocalService(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (req.method === 'GET' && req.url === `/api/v1/systems/${SYSTEM_ID}/status`) {
        res.writeHead(200)
        res.end(JSON.stringify({ ok: true, status: { state: 'parado' } }))
        return
      }
      if (
        req.method === 'POST' &&
        req.url === `/api/v1/systems/${SYSTEM_ID}/remote-validation/session`
      ) {
        res.writeHead(200)
        res.end(JSON.stringify({ ok: true, package: {} }))
        return
      }
      if (req.method === 'GET' && req.url?.includes('/remote-validation/session')) {
        res.writeHead(405)
        res.end(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }))
        return
      }
      res.writeHead(404)
      res.end(JSON.stringify({ ok: false, error: 'NOT_FOUND' }))
    })
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function waitForListen(port, host, timeoutMs = 15_000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ port, host }, () => {
        socket.end()
        resolve()
      })
      socket.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`timeout waiting ${host}:${port}`))
          return
        }
        setTimeout(tryOnce, 100)
      })
    }
    tryOnce()
  })
}

describe('serve-manager-ui.mjs — guard localhost-only (integração local)', () => {
  /** @type {import('node:http').Server | null} */
  let mockApi = null
  /** @type {import('node:child_process').ChildProcess | null} */
  let uiProc = null
  let uiPort = 0
  let uiRoot = ''
  let lanHost = ''

  before(async () => {
    lanHost = pickNonLoopbackHost() ?? ''
    uiPort = 5200 + Math.floor(Math.random() * 200)
    const mockPort = 47800 + Math.floor(Math.random() * 200)
    mockApi = await startMockLocalService(mockPort)

    uiRoot = path.join(os.tmpdir(), `sm-ui-test-${Date.now()}`)
    await fs.mkdir(uiRoot, { recursive: true })
    await fs.writeFile(path.join(uiRoot, 'index.html'), '<!doctype html><title>test</title>')

    const serveScript = path.join(__dirname, 'serve-manager-ui.mjs')
    uiProc = spawn(process.execPath, [serveScript, uiRoot], {
      env: {
        ...process.env,
        SM_UI_PORT: String(uiPort),
        SM_LOCAL_SERVICE_URL: `http://127.0.0.1:${mockPort}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    await waitForListen(uiPort, '127.0.0.1')
  })

  after(async () => {
    if (uiProc && !uiProc.killed) {
      uiProc.kill('SIGTERM')
      await new Promise((r) => uiProc?.once('exit', r))
    }
    if (mockApi) {
      await new Promise((r) => mockApi.close(r))
    }
    await fs.rm(uiRoot, { recursive: true, force: true })
  })

  it('403 em remote-validation via IP LAN — proxy producao', async () => {
    if (!lanHost) return
    const { status, body } = await requestJson(
      `http://${lanHost}:${uiPort}/api/v1/systems/${SYSTEM_ID}/remote-validation/session`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    )
    assert.equal(status, 403)
    assert.deepEqual(body, { ok: false, error: 'FORBIDDEN' })
  })

  it('permite status do sistema via IP LAN (nao protegido)', async () => {
    if (!lanHost) return
    const { status, body } = await requestJson(
      `http://${lanHost}:${uiPort}/api/v1/systems/${SYSTEM_ID}/status`,
      { method: 'GET' },
    )
    assert.equal(status, 200)
    assert.equal(body.ok, true)
  })

  it('loopback encaminha POST remote-validation ao upstream mock', async () => {
    const { status, body } = await requestJson(
      `http://127.0.0.1:${uiPort}/api/v1/systems/${SYSTEM_ID}/remote-validation/session`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    )
    assert.equal(status, 200)
    assert.equal(body.ok, true)
  })

  it('405 em GET remote-validation vem do upstream quando loopback (nao do guard)', async () => {
    const { status, body } = await requestJson(
      `http://127.0.0.1:${uiPort}/api/v1/systems/${SYSTEM_ID}/remote-validation/session`,
      { method: 'GET' },
    )
    assert.equal(status, 405)
    assert.equal(body.error, 'METHOD_NOT_ALLOWED')
  })
})
