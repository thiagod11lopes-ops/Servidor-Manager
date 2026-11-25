import type { IncomingMessage, ServerResponse } from 'node:http'
import { assertValidSystemId } from '../installation/paths.ts'
import { readJsonBody } from '../http/readJsonBody.ts'
import {
  analyzeSystemDatabase,
  collectDatabaseSummary,
  getDatabaseHostStatus,
  provisionSystemDatabase,
} from './databaseManager.ts'
import {
  fetchTableCatalog,
  fetchTableColumns,
  fetchTableRows,
  listBrowserSystems,
} from './tableBrowser/tableBrowserService.ts'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function parseSystemId(pathname: string, suffix: string): string | null {
  const prefix = '/api/v1/projects/'
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null
  const middle = pathname.slice(prefix.length, pathname.length - suffix.length)
  if (!middle || middle.includes('/')) return null
  return middle
}

function parseBrowserTableRoute(
  pathname: string,
  tail: 'meta' | 'rows',
): { systemId: string; schema: string; table: string } | null {
  const suffix = `/database/browser/tables/`
  const tailSuffix = tail === 'meta' ? '/meta' : '/rows'
  if (!pathname.endsWith(tailSuffix)) return null
  const withoutTail = pathname.slice(0, -tailSuffix.length)
  const prefix = '/api/v1/projects/'
  if (!withoutTail.startsWith(prefix) || !withoutTail.includes(suffix)) return null
  const afterPrefix = withoutTail.slice(prefix.length)
  const slashIdx = afterPrefix.indexOf('/')
  if (slashIdx <= 0) return null
  const systemId = afterPrefix.slice(0, slashIdx)
  const rest = afterPrefix.slice(slashIdx + 1)
  if (!rest.startsWith('database/browser/tables/')) return null
  const tablePath = rest.slice('database/browser/tables/'.length)
  const parts = tablePath.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  try {
    return {
      systemId,
      schema: decodeURIComponent(parts[0]),
      table: decodeURIComponent(parts[1]),
    }
  } catch {
    return null
  }
}

export async function tryHandleDatabaseRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/v1/database/status' && req.method === 'GET') {
    try {
      const payload = await getDatabaseHostStatus()
      sendJson(res, 200, payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'INTERNAL_ERROR'
      if (message === 'UNSUPPORTED_PLATFORM') {
        sendJson(res, 501, { ok: false, message: 'Plataforma não suportada para verificação de banco.' })
        return true
      }
      sendJson(res, 500, { ok: false, message: 'Falha ao verificar banco de dados local.' })
    }
    return true
  }

  if (pathname === '/api/v1/database/summary' && req.method === 'GET') {
    const summary = await collectDatabaseSummary()
    sendJson(res, 200, { ok: true, summary })
    return true
  }

  if (pathname === '/api/v1/database/browser/systems' && req.method === 'GET') {
    const payload = await listBrowserSystems()
    sendJson(res, 200, payload)
    return true
  }

  if (req.method === 'GET') {
    const catalogId = parseSystemId(pathname, '/database/browser/catalog')
    if (catalogId) {
      try {
        assertValidSystemId(catalogId)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Identificador de sistema inválido.' })
        return true
      }
      const response = await fetchTableCatalog(catalogId)
      sendJson(res, response.ok ? 200 : 503, response)
      return true
    }

    const metaRoute = parseBrowserTableRoute(pathname, 'meta')
    if (metaRoute) {
      try {
        assertValidSystemId(metaRoute.systemId)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Identificador de sistema inválido.' })
        return true
      }
      const response = await fetchTableColumns(metaRoute.systemId, metaRoute.schema, metaRoute.table)
      sendJson(res, response.ok ? 200 : 400, response)
      return true
    }

    const rowsRoute = parseBrowserTableRoute(pathname, 'rows')
    if (rowsRoute) {
      try {
        assertValidSystemId(rowsRoute.systemId)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Identificador de sistema inválido.' })
        return true
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
      const pageSize = Number.parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50
      const sortColumn = url.searchParams.get('sortColumn')?.trim() || undefined
      const sortDirection =
        url.searchParams.get('sortDirection') === 'desc' ? ('desc' as const) : ('asc' as const)
      const search = url.searchParams.get('search')?.trim() || undefined
      const searchColumn = url.searchParams.get('searchColumn')?.trim() || undefined
      const response = await fetchTableRows(rowsRoute.systemId, rowsRoute.schema, rowsRoute.table, {
        page,
        pageSize,
        sortColumn,
        sortDirection,
        search,
        searchColumn,
      })
      sendJson(res, response.ok ? 200 : 400, response)
      return true
    }
  }

  if (req.method === 'POST') {
    const analyzeId = parseSystemId(pathname, '/database/analyze')
    if (analyzeId) {
      try {
        assertValidSystemId(analyzeId)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Identificador de sistema inválido.' })
        return true
      }

      const response = await analyzeSystemDatabase(analyzeId)
      sendJson(res, response.ok ? 200 : 404, response)
      return true
    }

    const provisionId = parseSystemId(pathname, '/database/provision')
    if (provisionId) {
      try {
        assertValidSystemId(provisionId)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Identificador de sistema inválido.' })
        return true
      }

      let body: { admin?: { user?: unknown; password?: unknown; host?: unknown; port?: unknown } }
      try {
        body = await readJsonBody<{
          admin?: { user?: unknown; password?: unknown; host?: unknown; port?: unknown }
        }>(req)
      } catch {
        sendJson(res, 400, { ok: false, message: 'Corpo JSON inválido.' })
        return true
      }

      const admin =
        body.admin && typeof body.admin.user === 'string' && typeof body.admin.password === 'string'
          ? {
              user: body.admin.user,
              password: body.admin.password,
              host: typeof body.admin.host === 'string' ? body.admin.host : undefined,
              port: typeof body.admin.port === 'number' ? body.admin.port : undefined,
            }
          : undefined

      const response = await provisionSystemDatabase(provisionId, admin)
      if ('analysis' in response && response.analysis) {
        sendJson(res, response.ok ? 200 : 400, response)
      } else {
        sendJson(res, 400, response)
      }
      return true
    }
  }

  return false
}
