import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ALLOWED_ORIGINS, SERVICE_HOST, SERVICE_PORT } from '../config.ts'
import {
  buildLanAccessUrl,
  getPrimaryLanIPv4,
  isOriginAllowedForLanManager,
  readNetworkAccessConfig,
} from '../config/networkAccess.ts'
import { getServerInfo } from '../platform/getServerInfo.ts'
import { analyzeProjectFromLocalFolder } from '../projects/analyzeProjectFromLocalFolder.ts'
import { analyzeProjectFromUrl } from '../projects/analyzeProjectFromUrl.ts'
import { createInstallationPlan } from '../projects/createInstallationPlan.ts'
import { getEffectiveInstallationProgressSnapshot } from '../installation/installationProgressReconciliation.ts'
import { ensureInstallationProgressHydrated } from '../installation/installationProgressStore.ts'
import { assertValidSystemId } from '../installation/paths.ts'
import { installProject } from '../projects/installProject.ts'
import { readJsonBody } from './readJsonBody.ts'
import { tryHandleDatabaseRoute } from '../database/databaseRoutes.ts'
import { tryHandleManifestMaintenanceRoute } from '../runtime/manifestMaintenanceRoutes.ts'
import { tryHandleRuntimeRoute } from '../runtime/runtimeRoutes.ts'
import { discoverInstalledSystems } from '../systems/discoverInstalledSystems.ts'
import { tryHandleServerBootstrapRoute } from '../serverBootstrap/serverBootstrapRoutes.ts'
import { tryHandleMonitoringRoute } from '../monitoring/monitoringRoutes.ts'
import { tryHandleDockerRoute } from '../docker/dockerRoutes.ts'
import { startMonitoringScheduler } from '../monitoring/monitoringService.ts'
import { tryHandleBrowserLocalFolderRoute } from './browserLocalFolderRoutes.ts'
import { tryHandleBundledOmpsRoute } from '../bundledOmps/bundledOmpsRoutes.ts'
import { tryHandleSystemLanHttpPortRoute } from '../serverManifest/systemLanHttpPortRoutes.ts'
import { isInstallationDuplicateConflict } from '../installation/installationDuplicateGuard.ts'
import { tryHandleInstallationDuplicateRoute } from '../installation/installationDuplicateRoutes.ts'
import { getManagerUiPortForLanLinks } from '../runtime/managerRuntimeConfig.ts'
import { runServidorOmpsUnifiedSession } from '../servidorOmps/runServidorOmpsUnifiedSession.ts'

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void

const routes: Record<string, RouteHandler> = {
  'GET /api/v1/diagnostics/server-info': async (_req, res) => {
    const info = await getServerInfo()
    sendJson(res, 200, info)
  },
  'GET /api/v1/systems/discovered': async (_req, res) => {
    const systems = await discoverInstalledSystems()
    sendJson(res, 200, { ok: true, systems })
  },
  'GET /api/v1/diagnostics/network-access': async (_req, res) => {
    const config = readNetworkAccessConfig()
    const lanIPv4 = getPrimaryLanIPv4()
    sendJson(res, 200, {
      ok: true,
      allowLanAccess: config.allowLanAccess,
      lanIPv4,
      managerUrl: buildLanAccessUrl(getManagerUiPortForLanLinks(), '/sistemas'),
      note: `A API do Manager (${SERVICE_PORT}) permanece apenas em localhost; use a UI na porta ${getManagerUiPortForLanLinks()}.`,
    })
  },
  'POST /api/v1/projects/analyze': async (req, res) => {
    let body: { sourceUrl?: unknown; localFolderPath?: unknown }
    try {
      body = await readJsonBody<{ sourceUrl?: unknown; localFolderPath?: unknown }>(req)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INVALID_BODY'
      sendJson(res, 400, {
        ok: false,
        message:
          code === 'BODY_TOO_LARGE' || code === 'EMPTY_BODY'
            ? 'Requisição inválida para análise do projeto.'
            : 'Corpo JSON inválido.',
      })
      return
    }

    const localFolderPath =
      typeof body.localFolderPath === 'string' && body.localFolderPath.trim().length > 0
        ? body.localFolderPath.trim()
        : ''

    if (localFolderPath) {
      const response = await analyzeProjectFromLocalFolder(localFolderPath)
      sendJson(res, response.ok ? 200 : 400, response)
      return
    }

    if (typeof body.sourceUrl !== 'string') {
      sendJson(res, 400, { ok: false, message: 'Informe sourceUrl ou localFolderPath.' })
      return
    }

    const response = await analyzeProjectFromUrl(body.sourceUrl)
    sendJson(res, response.ok ? 200 : 400, response)
  },
  'POST /api/v1/projects/installation-plan': async (req, res) => {
    let body: { sourceUrl?: unknown; localFolderPath?: unknown; analysis?: unknown; systemId?: unknown }
    try {
      body = await readJsonBody<{
        sourceUrl?: unknown
        localFolderPath?: unknown
        analysis?: unknown
        systemId?: unknown
      }>(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Corpo JSON inválido.' })
      return
    }

    const localFolderPath =
      typeof body.localFolderPath === 'string' && body.localFolderPath.trim().length > 0
        ? body.localFolderPath.trim()
        : ''

    if (!localFolderPath && typeof body.sourceUrl !== 'string') {
      sendJson(res, 400, { ok: false, message: 'Informe sourceUrl ou localFolderPath.' })
      return
    }

    const cachedAnalysis =
      body.analysis && typeof body.analysis === 'object'
        ? (body.analysis as Record<string, unknown>)
        : undefined

    const systemId =
      typeof body.systemId === 'string' && body.systemId.trim() ? body.systemId.trim() : undefined

    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : ''
    const response = await createInstallationPlan(sourceUrl, cachedAnalysis, systemId, localFolderPath)
    sendJson(res, response.ok ? 200 : 400, response)
  },
  'GET /api/v1/projects/install/progress': async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${SERVICE_HOST}:${SERVICE_PORT}`)
    const systemId = url.searchParams.get('systemId')?.trim() ?? ''
    try {
      assertValidSystemId(systemId)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Informe systemId válido.' })
      return
    }

    await ensureInstallationProgressHydrated(systemId)
    const progress = await getEffectiveInstallationProgressSnapshot(systemId)
    sendJson(res, 200, { ok: true, progress })
  },
  'POST /api/v1/projects/install': async (req, res) => {
    let body: {
      systemId?: unknown
      sourceUrl?: unknown
      localFolderPath?: unknown
      installationPlan?: unknown
      accessMode?: unknown
      lanHost?: unknown
      overlayEnabled?: unknown
      resumeAfterDocker?: unknown
    }
    try {
      body = await readJsonBody<{
        systemId?: unknown
        sourceUrl?: unknown
        localFolderPath?: unknown
        installationPlan?: unknown
        accessMode?: unknown
        lanHost?: unknown
        overlayEnabled?: unknown
        resumeAfterDocker?: unknown
      }>(req)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Corpo JSON inválido.' })
      return
    }

    const response = await installProject(body)
    if (isInstallationDuplicateConflict(response)) {
      sendJson(res, 409, response)
      return
    }
    if (!response.ok && 'paused' in response && response.paused) {
      sendJson(res, 503, response)
      return
    }
    if (response.ok && 'accepted' in response && response.accepted) {
      sendJson(res, 202, response)
      return
    }
    sendJson(res, response.ok ? 200 : 400, response)
  },
}

function applyCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin
  const allowPackagedUi =
    !origin || origin === 'null' || origin.startsWith('file://') || origin.startsWith('app://')
  if (origin && (ALLOWED_ORIGINS.has(origin) || isOriginAllowedForLanManager(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else if (allowPackagedUi) {
    res.setHeader('Access-Control-Allow-Origin', 'null')
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function notFound(res: ServerResponse) {
  sendJson(res, 404, { error: 'NOT_FOUND' })
}

function methodNotAllowed(res: ServerResponse) {
  sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' })
}

function internalError(res: ServerResponse) {
  sendJson(res, 500, { error: 'INTERNAL_ERROR' })
}

export function startLocalService() {
  const server = http.createServer(async (req, res) => {
    applyCors(req, res)

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    const pathname = req.url?.split('?')[0] ?? ''

    if (await tryHandleDatabaseRoute(req, res, pathname)) {
      return
    }

    if (await tryHandleRuntimeRoute(req, res, pathname)) {
      return
    }

    if (await tryHandleSystemLanHttpPortRoute(req, res, pathname)) {
      return
    }

    if (await tryHandleManifestMaintenanceRoute(req, res, pathname)) {
      return
    }

    if (await tryHandleServerBootstrapRoute(req, res, pathname)) {
      return
    }

    if (await tryHandleMonitoringRoute(req, res, pathname)) {
      return
    }

    if (await tryHandleDockerRoute(req.method ?? 'GET', pathname, req, res)) {
      return
    }

    if (await tryHandleBrowserLocalFolderRoute(req, res, pathname)) {
      return
    }

    if (await tryHandleInstallationDuplicateRoute(req, res, pathname)) {
      return
    }

    if (await tryHandleBundledOmpsRoute(req, res, pathname)) {
      return
    }

    const routeKey = `${req.method ?? 'GET'} ${pathname}`
    const handler = routes[routeKey]

    if (!handler) {
      notFound(res)
      return
    }

    try {
      await handler(req, res)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'INTERNAL_ERROR'
      if (message === 'UNSUPPORTED_PLATFORM') {
        sendJson(res, 501, { error: 'UNSUPPORTED_PLATFORM' })
        return
      }
      internalError(res)
    }
  })

  server.listen(SERVICE_PORT, SERVICE_HOST, () => {
    console.log(`Servidor Manager local service em http://${SERVICE_HOST}:${SERVICE_PORT}`)
    startMonitoringScheduler()
    void runServidorOmpsUnifiedSession()
  })

  return server
}
