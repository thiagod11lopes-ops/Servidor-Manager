import type { IncomingMessage, ServerResponse } from 'node:http'
import { assertValidSystemId, getProjectDirectory } from '../installation/paths.ts'
import { readJsonBody } from '../http/readJsonBody.ts'
import { loadActiveServidorOmpsFixedLanPolicy } from '../products/servidorOmpsFixedLanRuntime.ts'
import {
  diagnoseFixedLanPort8080Conflict,
  readPort8080ReleaseAuthorization,
} from './fixedLanPort8080Conflict.ts'
import { executeAuthorizedFixedLanPort8080Release } from './fixedLanPort8080Release.ts'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function parseSystemId(pathname: string, suffix: string): string | null {
  const prefix = '/api/v1/systems/'
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null
  const middle = pathname.slice(prefix.length, pathname.length - suffix.length)
  if (!middle || middle.includes('/')) return null
  return middle
}

async function requireFixedLanProduct(res: ServerResponse): Promise<boolean> {
  const policy = await loadActiveServidorOmpsFixedLanPolicy()
  if (!policy) {
    sendJson(res, 404, {
      ok: false,
      message: 'Política de rede fixa do Servidor OMPS não está ativa nesta instalação do Manager.',
    })
    return false
  }
  return true
}

export async function tryHandleSystemLanHttpPortRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const method = req.method ?? 'GET'

  if (method === 'GET') {
    const systemId = parseSystemId(pathname, '/lan-http-port/fixed-8080/conflict')
    if (systemId) {
      try {
        assertValidSystemId(systemId)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Identificador de sistema inválido.' })
        return true
      }
      if (!(await requireFixedLanProduct(res))) return true
      const conflict = await diagnoseFixedLanPort8080Conflict({
        systemId,
        rootDirectory: getProjectDirectory(systemId),
      })
      const authorization = (await readPort8080ReleaseAuthorization(systemId)) ?? conflict.releaseAuthorization
      sendJson(res, 200, {
        ok: true,
        conflict: { ...conflict, releaseAuthorization: authorization },
      })
      return true
    }
  }

  if (method === 'POST') {
    const systemId = parseSystemId(pathname, '/lan-http-port/fixed-8080/release-authorized')
    if (systemId) {
      try {
        assertValidSystemId(systemId)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Identificador de sistema inválido.' })
        return true
      }
      if (!(await requireFixedLanProduct(res))) return true

      let body: {
        actionToken?: unknown
        confirm?: unknown
        listener?: { pid?: unknown; processName?: unknown; executablePath?: unknown }
      }
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Corpo JSON inválido.' })
        return true
      }

      if (body.confirm !== true) {
        sendJson(res, 400, {
          ok: false,
          code: 'NOT_AUTHORIZED',
          message: 'Confirme explicitamente a autorização para encerrar o processo identificado.',
        })
        return true
      }

      const actionToken = typeof body.actionToken === 'string' ? body.actionToken.trim() : ''
      if (!actionToken) {
        sendJson(res, 400, { ok: false, message: 'actionToken ausente.' })
        return true
      }

      const listenerBody = body.listener
      const pid =
        typeof listenerBody?.pid === 'number'
          ? listenerBody.pid
          : Number.parseInt(String(listenerBody?.pid ?? ''), 10)
      const processName =
        typeof listenerBody?.processName === 'string' ? listenerBody.processName.trim() : null
      const executablePath =
        typeof listenerBody?.executablePath === 'string' ? listenerBody.executablePath.trim() : null

      const result = await executeAuthorizedFixedLanPort8080Release({
        systemId,
        rootDirectory: getProjectDirectory(systemId),
        actionToken,
        confirm: true,
        listener: {
          pid: Number.isFinite(pid) ? pid : null,
          processName,
          executablePath,
        },
      })

      sendJson(res, result.ok ? 200 : 409, result)
      return true
    }
  }

  return false
}
