import type { IncomingMessage, ServerResponse } from 'node:http'
import { assertValidSystemId } from '../installation/paths.ts'
import { readJsonBody } from '../http/readJsonBody.ts'
import {
  collectRuntimeSummary,
  getSystemRuntimeStatus,
  restartManagedSystem,
  startManagedSystem,
  stopManagedSystem,
} from './systemProcessManager.ts'
import { uninstallManagedSystem } from './uninstallManagedSystem.ts'
import { tryHandleRemoteAccessValidationRoute } from './remoteAccessValidationRoutes.ts'
import {
  buildServiceStatus,
  getServiceConfigPublic,
  installSystemService,
  restartSystemService,
  setSystemServiceStartup,
  startSystemService,
  stopSystemService,
  uninstallSystemService,
} from './service/serviceManager.ts'

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

async function withSystemId(
  res: ServerResponse,
  systemId: string,
  run: (id: string) => Promise<void>,
): Promise<boolean> {
  try {
    assertValidSystemId(systemId)
  } catch {
    sendJson(res, 400, { ok: false, message: 'Identificador de sistema inválido.' })
    return true
  }
  await run(systemId)
  return true
}

export async function tryHandleRuntimeRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/v1/diagnostics/systems-runtime-summary' && req.method === 'GET') {
    const summary = await collectRuntimeSummary()
    sendJson(res, 200, { ok: true, summary })
    return true
  }

  const method = req.method ?? 'GET'

  if (method === 'GET') {
    const systemId = parseSystemId(pathname, '/status')
    if (systemId) {
      return withSystemId(res, systemId, async (id) => {
        const response = await getSystemRuntimeStatus(id)
        sendJson(res, response.ok ? 200 : 404, response)
      })
    }

    const serviceStatusId = parseSystemId(pathname, '/service/status')
    if (serviceStatusId) {
      return withSystemId(res, serviceStatusId, async (id) => {
        const status = await buildServiceStatus(id)
        sendJson(res, 200, { ok: true, status })
      })
    }

    const serviceConfigId = parseSystemId(pathname, '/service/config')
    if (serviceConfigId) {
      return withSystemId(res, serviceConfigId, async (id) => {
        const config = await getServiceConfigPublic(id)
        const status = await buildServiceStatus(id)
        sendJson(res, 200, {
          ok: true,
          config: config
            ? {
                systemId: config.systemId,
                serviceName: config.serviceName,
                installed: config.installed,
                startupMode: config.startupMode,
                installedPath: config.installedPath,
              }
            : {
                systemId: id,
                serviceName: status.serviceName,
                installed: false,
                startupMode: 'manual' as const,
                installedPath: status.installedPath,
              },
          status,
        })
      })
    }
  }

  if (method === 'POST') {
    if (await tryHandleRemoteAccessValidationRoute(req, res, pathname)) {
      return true
    }

    const serviceRoutes: { suffix: string; run: (id: string, body?: unknown) => Promise<unknown> }[] = [
      {
        suffix: '/service/install',
        run: async (id, body) => {
          const payload = body as { automaticStartup?: unknown } | undefined
          const automaticStartup = payload?.automaticStartup === true
          return installSystemService(id, automaticStartup)
        },
      },
      { suffix: '/service/uninstall', run: (id) => uninstallSystemService(id) },
      { suffix: '/service/start', run: (id) => startSystemService(id) },
      { suffix: '/service/stop', run: (id) => stopSystemService(id) },
      { suffix: '/service/restart', run: (id) => restartSystemService(id) },
      {
        suffix: '/service/startup/automatic',
        run: (id) => setSystemServiceStartup(id, true),
      },
      {
        suffix: '/service/startup/manual',
        run: (id) => setSystemServiceStartup(id, false),
      },
    ]

    for (const route of serviceRoutes) {
      const systemId = parseSystemId(pathname, route.suffix)
      if (!systemId) continue

      return withSystemId(res, systemId, async (id) => {
        let body: unknown
        if (route.suffix === '/service/install') {
          try {
            body = await readJsonBody(req)
          } catch {
            body = {}
          }
        }
        const response = await route.run(id, body)
        const item = response as { ok: boolean }
        sendJson(res, item.ok ? 200 : 400, response)
      })
    }

    const actions: { suffix: string; run: (id: string) => Promise<unknown> }[] = [
      { suffix: '/start', run: startManagedSystem },
      { suffix: '/stop', run: stopManagedSystem },
      { suffix: '/restart', run: restartManagedSystem },
      { suffix: '/uninstall', run: uninstallManagedSystem },
    ]

    for (const action of actions) {
      const systemId = parseSystemId(pathname, action.suffix)
      if (!systemId) continue
      return withSystemId(res, systemId, async (id) => {
        const response = await action.run(id)
        sendJson(res, (response as { ok: boolean }).ok ? 200 : 400, response)
      })
    }
  }

  return false
}
