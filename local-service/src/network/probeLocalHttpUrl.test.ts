import assert from 'node:assert/strict'
import http from 'node:http'
import { describe, it } from 'node:test'
import { probeLocalHttpUrl } from './probeLocalHttpUrl.ts'

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

describe('probeLocalHttpUrl', () => {
  it('rejeita URL invalida', async () => {
    const result = await probeLocalHttpUrl('not-a-url')
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, 'INVALID_URL')
  })

  it('rejeita protocolo nao suportado', async () => {
    const result = await probeLocalHttpUrl('ftp://127.0.0.1/')
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, 'UNSUPPORTED_PROTOCOL')
  })

  it('rejeita destino nao local sem rede', async () => {
    const result = await probeLocalHttpUrl('http://192.168.0.10:8080/')
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, 'NON_LOCAL_HOST')
  })

  it('registra resposta HTTP 200', async () => {
    const server = await listenOnce((_req, res) => {
      res.writeHead(200)
      res.end('ok')
    })
    try {
      const result = await probeLocalHttpUrl(`http://127.0.0.1:${server.port}/app`)
      assert.equal(result.ok, true)
      if (result.ok) {
        assert.equal(result.responded, true)
        assert.equal(result.status, 200)
      }
    } finally {
      await server.close()
    }
  })

  it('registra 404 e 500 como resposta HTTP recebida', async () => {
    for (const status of [404, 500]) {
      const server = await listenOnce((_req, res) => {
        res.writeHead(status)
        res.end()
      })
      try {
        const result = await probeLocalHttpUrl(`http://127.0.0.1:${server.port}/`)
        assert.equal(result.ok, true, `status ${status}`)
        if (result.ok) assert.equal(result.status, status)
      } finally {
        await server.close()
      }
    }
  })

  it('reporta erro de transporte em porta fechada', async () => {
    const result = await probeLocalHttpUrl('http://127.0.0.1:1/', { timeoutMs: 2_000 })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.responded, false)
      assert.equal(result.reason, 'TRANSPORT_ERROR')
    }
  })

  it('reporta timeout', async () => {
    const server = await listenOnce((_req, _res) => {
      // não responde
    })
    try {
      const result = await probeLocalHttpUrl(`http://127.0.0.1:${server.port}/slow`, {
        timeoutMs: 200,
      })
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.reason, 'TIMEOUT')
    } finally {
      await server.close()
    }
  })
})
