import assert from 'node:assert/strict'
import http from 'node:http'
import { describe, it } from 'node:test'
import { enrichStatusWithLocalHttpProbe } from './enrichLocalHttpProbe.ts'
import type { RuntimeStateSnapshot } from './types.ts'

function baseStatus(overrides: Partial<RuntimeStateSnapshot> = {}): RuntimeStateSnapshot {
  return {
    systemId: '00000000-0000-4000-8000-000000000001',
    state: 'executando',
    pid: 1,
    startedAt: null,
    stoppedAt: null,
    uptimeSeconds: null,
    port: 8080,
    workingDirectory: 'C:\\test',
    startCommand: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
    loginUrl: 'http://192.168.0.10:8080/login',
    ...overrides,
  }
}

function listenOnce(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('address unavailable'))
        return
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()))
          }),
      })
    })
  })
}

describe('enrichStatusWithLocalHttpProbe', () => {
  it('retorna null quando parado', async () => {
    const result = await enrichStatusWithLocalHttpProbe(baseStatus({ state: 'parado' }))
    assert.equal(result.localHttpReachable, null)
  })

  it('marca reachable true em resposta HTTP 404', async () => {
    const server = await listenOnce((_req, res) => {
      res.writeHead(404)
      res.end()
    })
    try {
      const result = await enrichStatusWithLocalHttpProbe(
        baseStatus({ loginUrl: `http://192.168.0.10:${server.port}/login` }),
      )
      assert.equal(result.localHttpReachable, true)
      assert.equal(result.localHttpStatus, 404)
      assert.equal(result.localHttpProbeUrl, `http://127.0.0.1:${server.port}/login`)
    } finally {
      await server.close()
    }
  })

  it('marca reachable false em falha de transporte', async () => {
    const result = await enrichStatusWithLocalHttpProbe(
      baseStatus({ loginUrl: 'http://192.168.0.10:9/login' }),
    )
    assert.equal(result.localHttpReachable, false)
    assert.equal(result.localHttpProbeUrl, 'http://127.0.0.1:9/login')
    assert.equal(result.localHttpStatus, undefined)
    assert.equal(result.state, 'executando')
  })
})
