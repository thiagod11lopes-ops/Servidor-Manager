import type { IncomingMessage, ServerResponse } from 'node:http'
import { BROWSER_UPLOAD_LIMITS, applyBrowserLocalFolderUpload } from '../projects/browserLocalFolderUpload.ts'
import { readMultipartFormData } from './parseMultipartFormData.ts'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function tryHandleBrowserLocalFolderRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== '/api/v1/projects/local-folder/browser-upload') {
    return false
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' })
    return true
  }

  try {
    const form = await readMultipartFormData(req, {
      maxBytes: BROWSER_UPLOAD_LIMITS.maxTotalBytes + 512 * 1024,
      maxFiles: BROWSER_UPLOAD_LIMITS.maxFiles,
      maxFileBytes: BROWSER_UPLOAD_LIMITS.maxFileBytes,
    })

    const uploadId = form.fields.uploadId
    const displayName = form.fields.displayName
    const fileParts = form.files
      .filter((part) => part.fieldName === 'files' || part.fieldName === 'file')
      .map((part) => ({ filename: part.filename, data: part.data }))

    const result = await applyBrowserLocalFolderUpload({
      uploadId,
      displayName,
      files: fileParts,
    })

    if (!result.ok) {
      sendJson(res, 400, {
        ok: false,
        code: result.code,
        message: result.message ?? result.code,
      })
      return true
    }

    sendJson(res, 200, {
      ok: true,
      localFolderPath: result.localFolderPath,
      uploadId: result.uploadId,
      fileCount: result.fileCount,
      totalBytes: result.totalBytes,
      displayName: typeof displayName === 'string' ? displayName.trim() : undefined,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'INTERNAL_ERROR'
    if (code === 'BODY_TOO_LARGE') {
      sendJson(res, 413, {
        ok: false,
        code,
        message: 'A pasta excede o tamanho total permitido para envio pelo navegador.',
      })
      return true
    }
    if (code === 'TOO_MANY_FILES' || code === 'FILE_TOO_LARGE') {
      sendJson(res, 400, {
        ok: false,
        code,
        message: 'A pasta excede os limites de arquivos ou tamanho por arquivo.',
      })
      return true
    }
    if (code === 'INVALID_MULTIPART') {
      sendJson(res, 400, { ok: false, code, message: 'Corpo multipart inválido.' })
      return true
    }
    sendJson(res, 500, { ok: false, code: 'INTERNAL_ERROR' })
  }

  return true
}
