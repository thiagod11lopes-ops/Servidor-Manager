import type { IncomingMessage, ServerResponse } from 'node:http'
import { assertValidSystemId } from '../installation/paths.ts'
import { readJsonBody } from '../http/readJsonBody.ts'
import {
  runManifestDatabaseBackup,
  runManifestSystemUpdate,
} from '../serverManifest/runManifestMaintenance.ts'

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

export async function tryHandleManifestMaintenanceRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (req.method !== 'POST') return false

  const routes: { suffix: string; run: (systemId: string, body: unknown) => Promise<unknown> }[] = [
    {
      suffix: '/manifest/backup',
      run: (systemId) => runManifestDatabaseBackup(systemId),
    },
    {
      suffix: '/manifest/update',
      run: async (systemId, body) => {
        const payload = body as { skipBackup?: unknown } | undefined
        return runManifestSystemUpdate(systemId, { skipBackup: payload?.skipBackup === true })
      },
    },
  ]

  for (const route of routes) {
    const systemId = parseSystemId(pathname, route.suffix)
    if (!systemId) continue

    try {
      assertValidSystemId(systemId)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Identificador de sistema inválido.' })
      return true
    }

    let body: unknown = {}
    if (route.suffix === '/manifest/update') {
      try {
        body = await readJsonBody(req)
      } catch {
        body = {}
      }
    }

    const result = await route.run(systemId, body)
    const item = result as { ok: boolean }
    sendJson(res, item.ok ? 200 : 400, result)
    return true
  }

  return false
}
