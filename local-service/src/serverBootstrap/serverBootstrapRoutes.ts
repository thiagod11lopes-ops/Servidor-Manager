import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../http/readJsonBody.ts'
import { getServerBootstrapStatus } from './checkWindowsServerEnvironment.ts'
import {
  getBootstrapJob,
  readBootstrapJobLogTail,
  startBootstrapInstallJob,
} from './bootstrapJobs.ts'
import { resolveBootstrapScriptDir } from './resolveBootstrapScriptDir.ts'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function tryHandleServerBootstrapRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/v1/server/bootstrap/status' && req.method === 'GET') {
    const bootstrapScriptAvailable = resolveBootstrapScriptDir() !== null
    const status = await getServerBootstrapStatus({ bootstrapScriptAvailable })
    sendJson(res, 200, { ok: true, status })
    return true
  }

  if (pathname === '/api/v1/server/bootstrap/install' && req.method === 'POST') {
    let body: { installMissing?: unknown; launchDockerDesktop?: unknown } = {}
    try {
      body = await readJsonBody(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Corpo JSON inválido.' })
      return true
    }

    const result = await startBootstrapInstallJob({
      installMissing: body.installMissing !== false,
      launchDockerDesktop: body.launchDockerDesktop === true,
    })

    if (!result.ok) {
      sendJson(res, 503, result)
      return true
    }

    sendJson(res, 202, { ok: true, job: result.job })
    return true
  }

  const jobMatch = /^\/api\/v1\/server\/bootstrap\/jobs\/([^/]+)$/.exec(pathname)
  if (jobMatch && req.method === 'GET') {
    const jobId = decodeURIComponent(jobMatch[1])
    const job = getBootstrapJob(jobId)
    if (!job) {
      sendJson(res, 404, { ok: false, message: 'Job não encontrado.' })
      return true
    }
    const logTail = await readBootstrapJobLogTail(job.logPath)
    sendJson(res, 200, { ok: true, job, logTail })
    return true
  }

  return false
}
