import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLoopbackClientRequest } from '../http/assertLoopbackClient.ts'
import { assertValidSystemId } from '../installation/paths.ts'
import { readJsonBody } from '../http/readJsonBody.ts'
import fs from 'node:fs/promises'
import path from 'node:path'
import { monitoringFile } from './paths.ts'
import {
  deleteAuthUser,
  disableAuthUser,
  getAcompDetail,
  getAlerts,
  getAuthUsers,
  getHistory,
  getDashboardOverview,
  getLiveMetrics,
  getMonitoringState,
  getSettings,
  getSystemStorage,
  updateSettings,
} from './monitoringService.ts'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function appendAdminAudit(line: string): Promise<void> {
  const entry = `${new Date().toISOString()}\t${line}\n`
  await fs.mkdir(path.dirname(monitoringFile('admin-audit.log')), { recursive: true })
  await fs.appendFile(monitoringFile('admin-audit.log'), entry, 'utf8')
}

function rejectNonLoopback(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isLoopbackClientRequest(req)) {
    sendJson(res, 403, { ok: false, message: 'Monitoramento disponível apenas via localhost.' })
    return true
  }
  return false
}

export async function tryHandleMonitoringRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/monitoring')) return false
  if (rejectNonLoopback(req, res)) return true

  const method = req.method ?? 'GET'

  if (pathname === '/api/v1/monitoring/live' && method === 'GET') {
    const live = await getLiveMetrics()
    sendJson(res, 200, { ok: true, live, state: getMonitoringState() })
    return true
  }

  if (pathname === '/api/v1/monitoring/dashboard/overview' && method === 'GET') {
    const overview = await getDashboardOverview()
    sendJson(res, 200, overview)
    return true
  }

  if (pathname === '/api/v1/monitoring/history' && method === 'GET') {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const rangeParam = url.searchParams.get('range') ?? '24h'
    const range = rangeParam === '7d' || rangeParam === '30d' ? rangeParam : '24h'
    const samples = await getHistory(range)
    sendJson(res, 200, { ok: true, range, samples })
    return true
  }

  if (pathname === '/api/v1/monitoring/storage/volumes' && method === 'GET') {
    const live = await getLiveMetrics()
    sendJson(res, 200, { ok: true, volumes: live.volumes, collectedAt: live.collectedAt })
    return true
  }

  if (pathname === '/api/v1/monitoring/storage/systems' && method === 'GET') {
    const systems = await getSystemStorage()
    sendJson(res, 200, { ok: true, systems, state: getMonitoringState() })
    return true
  }

  if (pathname === '/api/v1/monitoring/alerts' && method === 'GET') {
    const alerts = await getAlerts()
    sendJson(res, 200, { ok: true, alerts })
    return true
  }

  if (pathname === '/api/v1/monitoring/settings' && method === 'GET') {
    const settings = await getSettings()
    sendJson(res, 200, { ok: true, settings })
    return true
  }

  if (pathname === '/api/v1/monitoring/settings' && method === 'PUT') {
    let body: Record<string, unknown>
    try {
      body = await readJsonBody<Record<string, unknown>>(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Corpo JSON inválido.' })
      return true
    }
    try {
      const settings = await updateSettings({
        attentionUsedPercent:
          typeof body.attentionUsedPercent === 'number' ? body.attentionUsedPercent : undefined,
        criticalUsedPercent:
          typeof body.criticalUsedPercent === 'number' ? body.criticalUsedPercent : undefined,
        severeUsedPercent: typeof body.severeUsedPercent === 'number' ? body.severeUsedPercent : undefined,
        minFreeBytesWarning:
          body.minFreeBytesWarning === null
            ? null
            : typeof body.minFreeBytesWarning === 'number'
              ? body.minFreeBytesWarning
              : undefined,
      })
      sendJson(res, 200, { ok: true, settings })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'INVALID_THRESHOLDS'
      sendJson(res, 400, { ok: false, message })
    }
    return true
  }

  const acompMatch = /^\/api\/v1\/monitoring\/systems\/([^/]+)\/acompsolemp-storage$/.exec(pathname)
  if (acompMatch && method === 'GET') {
    try {
      assertValidSystemId(acompMatch[1]!)
      const detail = await getAcompDetail(acompMatch[1]!)
      if (!detail) {
        sendJson(res, 404, { ok: false, message: 'Sistema não é perfil supabase-local-v1 ou não encontrado.' })
        return true
      }
      sendJson(res, 200, { ok: true, detail })
    } catch {
      sendJson(res, 400, { ok: false, message: 'systemId inválido.' })
    }
    return true
  }

  const usersMatch = /^\/api\/v1\/monitoring\/systems\/([^/]+)\/auth-users$/.exec(pathname)
  if (usersMatch && method === 'GET') {
    try {
      assertValidSystemId(usersMatch[1]!)
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
      const q = url.searchParams.get('q') ?? undefined
      const payload = await getAuthUsers(usersMatch[1]!, page, q)
      sendJson(res, payload.ok ? 200 : 503, payload)
    } catch {
      sendJson(res, 400, { ok: false, message: 'systemId inválido.' })
    }
    return true
  }

  const disableMatch = /^\/api\/v1\/monitoring\/systems\/([^/]+)\/auth-users\/([^/]+)\/disable$/.exec(pathname)
  if (disableMatch && method === 'POST') {
    try {
      assertValidSystemId(disableMatch[1]!)
      const result = await disableAuthUser(disableMatch[1]!, disableMatch[2]!)
      if (result.ok) {
        await appendAdminAudit(`disable-user system=${disableMatch[1]} user=${disableMatch[2]}`)
      }
      sendJson(res, result.ok ? 200 : 400, result)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Requisição inválida.' })
    }
    return true
  }

  async function handleAuthUserDelete(systemId: string, userId: string, confirm: unknown) {
    if (confirm !== 'DELETE') {
      sendJson(res, 400, {
        ok: false,
        message: 'Confirme com { "confirm": "DELETE" }. Exclusão no Auth não remove dados relacionados automaticamente.',
      })
      return
    }
    const result = await deleteAuthUser(systemId, userId)
    if (result.ok) {
      await appendAdminAudit(`delete-user system=${systemId} user=${userId}`)
    }
    sendJson(res, result.ok ? 200 : 400, result)
  }

  const deletePostMatch = /^\/api\/v1\/monitoring\/systems\/([^/]+)\/auth-users\/([^/]+)\/delete$/.exec(
    pathname,
  )
  if (deletePostMatch && method === 'POST') {
    try {
      assertValidSystemId(deletePostMatch[1]!)
      let body: { confirm?: unknown }
      try {
        body = await readJsonBody<{ confirm?: unknown }>(req)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Confirmação obrigatória (confirm=DELETE).' })
        return true
      }
      await handleAuthUserDelete(deletePostMatch[1]!, deletePostMatch[2]!, body.confirm)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Requisição inválida.' })
    }
    return true
  }

  const deleteMatch = /^\/api\/v1\/monitoring\/systems\/([^/]+)\/auth-users\/([^/]+)$/.exec(pathname)
  if (deleteMatch && method === 'DELETE') {
    try {
      assertValidSystemId(deleteMatch[1]!)
      let body: { confirm?: unknown }
      try {
        body = await readJsonBody<{ confirm?: unknown }>(req)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Confirmação obrigatória (confirm=DELETE).' })
        return true
      }
      await handleAuthUserDelete(deleteMatch[1]!, deleteMatch[2]!, body.confirm)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Requisição inválida.' })
    }
    return true
  }

  sendJson(res, 404, { ok: false, message: 'NOT_FOUND' })
  return true
}
