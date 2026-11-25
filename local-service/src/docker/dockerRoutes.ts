import type { IncomingMessage, ServerResponse } from 'node:http'
import { ensureDockerEngineReady, launchDockerDesktop, probeDockerEngine } from './dockerDesktopEnsure.ts'
import { readJsonBody } from '../http/readJsonBody.ts'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function tryHandleDockerRoute(
  method: string,
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (method === 'GET' && pathname === '/api/v1/docker/status') {
    const state = await probeDockerEngine()
    sendJson(res, 200, { ok: true, state })
    return true
  }

  if (method === 'POST' && pathname === '/api/v1/docker/launch') {
    const launch = await launchDockerDesktop()
    const state = await probeDockerEngine()
    sendJson(res, launch.ok ? 200 : 503, {
      ok: launch.ok,
      message: launch.detail,
      state,
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/v1/docker/ensure') {
    let wait = true
    try {
      const body = await readJsonBody<{ wait?: unknown }>(req)
      if (body.wait === false) wait = false
    } catch {
      // corpo vazio → aguardar Engine
    }

    if (!wait) {
      const state = await probeDockerEngine()
      sendJson(res, 200, { ok: state.running, state, message: state.detail })
      return true
    }

    const result = await ensureDockerEngineReady()
    sendJson(res, result.ok ? 200 : 503, result)
    return true
  }

  return false
}
