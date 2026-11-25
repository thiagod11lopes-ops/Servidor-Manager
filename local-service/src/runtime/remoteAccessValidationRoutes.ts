import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLoopbackClientRequest } from '../http/assertLoopbackClient.ts'
import { assertValidSystemId } from '../installation/paths.ts'
import { readSystemAccessModeConfig } from '../config/systemAccessMode.ts'
import {
  getRemoteValidationAccessModeBlockReason,
  remoteValidationAccessModeBlockMessage,
} from './remoteValidation/remoteValidationAccessMode.ts'

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

function forbidden(res: ServerResponse) {
  sendJson(res, 403, { ok: false, error: 'FORBIDDEN' })
}

export async function tryHandleRemoteAccessValidationRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const sessionSuffix = '/remote-validation/session'
  const reportSuffix = '/remote-validation/report'

  const method = req.method ?? 'GET'
  if (method !== 'POST') {
    const maybeSession = parseSystemId(pathname, sessionSuffix)
    const maybeReport = parseSystemId(pathname, reportSuffix)
    if (maybeSession || maybeReport) {
      sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' })
      return true
    }
    return false
  }

  const systemIdForSession = parseSystemId(pathname, sessionSuffix)
  const systemIdForReport = parseSystemId(pathname, reportSuffix)
  const systemId = systemIdForSession ?? systemIdForReport
  if (!systemId) return false

  if (!isLoopbackClientRequest(req)) {
    forbidden(res)
    return true
  }

  try {
    assertValidSystemId(systemId)
  } catch {
    sendJson(res, 400, { ok: false, message: 'Identificador de sistema inválido.' })
    return true
  }

  const accessModeBlock = getRemoteValidationAccessModeBlockReason(systemId)
  if (accessModeBlock) {
    sendJson(res, 400, {
      ok: false,
      reason: accessModeBlock,
      message: remoteValidationAccessModeBlockMessage(accessModeBlock),
      accessMode: readSystemAccessModeConfig(systemId)?.mode ?? null,
    })
    return true
  }

  sendJson(res, 410, { ok: false, error: 'GONE', message: 'Validação remota descontinuada.' })
  return true
}
