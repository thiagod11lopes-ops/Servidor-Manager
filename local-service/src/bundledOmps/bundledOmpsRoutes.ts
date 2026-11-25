import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../http/readJsonBody.ts'
import { isInstallationDuplicateConflict } from '../installation/installationDuplicateGuard.ts'
import { getBundledOmpsServerStatus, startBundledOmpsServerInstall } from './installBundledOmpsServer.ts'
import { getServidorOmpsContractAccessStatus } from '../products/servidorOmpsContractAccess.ts'
import { analyzeServidorOmpsAccess } from '../servidorOmps/analyzeServidorOmpsAccess.ts'
import { getServidorOmpsEmbeddedInstallProgress } from '../servidorOmps/servidorOmpsEmbeddedInstallProgress.ts'
import {
  pauseServidorOmpsEmbeddedInstall,
  restartServidorOmpsEmbeddedInstall,
} from '../servidorOmps/controlServidorOmpsEmbeddedInstall.ts'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function tryHandleBundledOmpsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (req.method === 'GET' && pathname === '/api/v1/products/bundled-omps/status') {
    const status = await getBundledOmpsServerStatus()
    sendJson(res, 200, status)
    return true
  }

  if (req.method === 'GET' && pathname === '/api/v1/products/servidor-omps/contract-access') {
    const status = await getServidorOmpsContractAccessStatus()
    sendJson(res, 200, status)
    return true
  }

  if (req.method === 'POST' && pathname === '/api/v1/products/servidor-omps/analyze') {
    const status = await analyzeServidorOmpsAccess()
    sendJson(res, 200, status)
    return true
  }

  if (req.method === 'GET' && pathname === '/api/v1/products/servidor-omps/embedded-install-progress') {
    const payload = await getServidorOmpsEmbeddedInstallProgress()
    sendJson(res, 200, payload)
    return true
  }

  if (req.method === 'POST' && pathname === '/api/v1/products/servidor-omps/embedded-install/pause') {
    const payload = await pauseServidorOmpsEmbeddedInstall()
    sendJson(res, payload.ok ? 200 : 400, payload)
    return true
  }

  if (req.method === 'POST' && pathname === '/api/v1/products/servidor-omps/embedded-install/restart') {
    const payload = await restartServidorOmpsEmbeddedInstall()
    sendJson(res, payload.ok ? 202 : 400, payload)
    return true
  }

  if (req.method === 'POST' && pathname === '/api/v1/products/bundled-omps/install') {
    let body: { accessMode?: unknown; lanHost?: unknown; duplicateDecision?: unknown }
    try {
      body = await readJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Corpo JSON inválido.' })
      return true
    }

    const result = await startBundledOmpsServerInstall(body)
    if (isInstallationDuplicateConflict(result)) {
      sendJson(res, 409, result)
      return true
    }
    if ('paused' in result && result.paused) {
      sendJson(res, 503, result)
      return true
    }
    if (!result.ok) {
      sendJson(res, 400, result)
      return true
    }
    if ('accepted' in result && result.accepted) {
      sendJson(res, 202, result)
      return true
    }
    sendJson(res, 200, result)
    return true
  }

  return false
}
