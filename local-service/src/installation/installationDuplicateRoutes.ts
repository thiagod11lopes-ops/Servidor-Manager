import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody } from '../http/readJsonBody.ts'
import { bundledOmpsInstallationSourceKeys } from './normalizeInstallationSourceKey.ts'
import { findInstallationDuplicateConflict } from './installationDuplicateGuard.ts'
import { installationSourceKeyFromSourceUrl } from './normalizeInstallationSourceKey.ts'
import { getManagerInstallRoot } from '../bundledOmps/managerInstallRoot.ts'
import { verifyBundledOmpsPayloadAtInstallRoot } from '../bundledOmps/verifyBundledOmpsPayload.ts'
import { parseProjectInstallSource } from '../sources/projectInstallSource.ts'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function tryHandleInstallationDuplicateRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (req.method !== 'POST' || pathname !== '/api/v1/installations/duplicate-check') {
    return false
  }

  let body: {
    bundledOmps?: unknown
    sourceUrl?: unknown
    localFolderPath?: unknown
    excludeSystemId?: unknown
  }
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { ok: false, message: 'Corpo JSON inválido.' })
    return true
  }

  const excludeSystemId =
    typeof body.excludeSystemId === 'string' && body.excludeSystemId.trim().length > 0
      ? body.excludeSystemId.trim()
      : undefined

  let sourceKeys: string[] = []

  if (body.bundledOmps === true) {
    const installRoot = getManagerInstallRoot()
    if (!installRoot) {
      sendJson(res, 400, {
        ok: false,
        message: 'InstallRoot não definido — use o Manager instalado.',
      })
      return true
    }
    const verified = await verifyBundledOmpsPayloadAtInstallRoot(installRoot)
    if (!verified.ok) {
      sendJson(res, 400, { ok: false, message: verified.reason })
      return true
    }
    sourceKeys = bundledOmpsInstallationSourceKeys(
      verified.verified.payloadDirectory,
      verified.verified.contentSha256,
    )
  } else {
    const parsed = await parseProjectInstallSource({
      sourceUrl: body.sourceUrl,
      localFolderPath: body.localFolderPath,
    })
    if (!parsed.ok) {
      sendJson(res, 400, { ok: false, message: parsed.message })
      return true
    }
    sourceKeys = [installationSourceKeyFromSourceUrl(parsed.source.sourceUrl)]
  }

  const conflict = await findInstallationDuplicateConflict({ sourceKeys, excludeSystemId })
  if (conflict) {
    sendJson(res, 200, { ok: true, duplicate: true, conflict })
    return true
  }

  sendJson(res, 200, { ok: true, duplicate: false })
  return true
}
