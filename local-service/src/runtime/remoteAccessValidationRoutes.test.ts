import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, it } from 'node:test'
import { tryHandleRemoteAccessValidationRoute } from './remoteAccessValidationRoutes.ts'

const SYSTEM_ID = '00000000-0000-4000-8000-000000000001'

function mockResponse(): {
  res: ServerResponse
  status: () => number
  body: () => unknown
} {
  let statusCode = 0
  let payload: unknown
  const res = {
    statusCode: 0,
    setHeader() {},
    end(data: string) {
      payload = JSON.parse(data)
      statusCode = res.statusCode
    },
  } as ServerResponse
  return {
    res,
    status: () => statusCode,
    body: () => payload,
  }
}

function mockRequest(remoteAddress: string, method = 'POST'): IncomingMessage {
  return {
    method,
    socket: { remoteAddress },
  } as IncomingMessage
}

describe('tryHandleRemoteAccessValidationRoute loopback', () => {
  it('rejeita cliente nao loopback na sessao', async () => {
    const { res, status, body } = mockResponse()
    const handled = await tryHandleRemoteAccessValidationRoute(
      mockRequest('192.168.0.50'),
      res,
      `/api/v1/systems/${SYSTEM_ID}/remote-validation/session`,
    )
    assert.equal(handled, true)
    assert.equal(status(), 403)
    assert.deepEqual(body(), { ok: false, error: 'FORBIDDEN' })
  })

  it('rejeita cliente nao loopback no report', async () => {
    const { res, status, body } = mockResponse()
    const handled = await tryHandleRemoteAccessValidationRoute(
      mockRequest('10.0.0.8'),
      res,
      `/api/v1/systems/${SYSTEM_ID}/remote-validation/report`,
    )
    assert.equal(handled, true)
    assert.equal(status(), 403)
    assert.deepEqual(body(), { ok: false, error: 'FORBIDDEN' })
  })

  it('bloqueia sessao em loopback (validacao remota removida)', async () => {
    const { res, status, body } = mockResponse()
    const handled = await tryHandleRemoteAccessValidationRoute(
      mockRequest('127.0.0.1'),
      res,
      `/api/v1/systems/${SYSTEM_ID}/remote-validation/session`,
    )
    assert.equal(handled, true)
    assert.equal(status(), 400)
    const parsed = body() as { ok: boolean; reason?: string }
    assert.equal(parsed.ok, false)
    assert.equal(parsed.reason, 'REMOVED')
  })

  it('nao trata GET como rota de validacao', async () => {
    const { res, status } = mockResponse()
    const handled = await tryHandleRemoteAccessValidationRoute(
      mockRequest('127.0.0.1', 'GET'),
      res,
      `/api/v1/systems/${SYSTEM_ID}/remote-validation/session`,
    )
    assert.equal(handled, true)
    assert.equal(status(), 405)
  })
})
