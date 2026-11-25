import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getBrowserUploadStagingRoot } from '../installation/managerDataRoot.ts'
import {
  assertValidBrowserUploadSessionId,
  isPathInsideRoot,
} from '../sources/localFolderAccessPolicy.ts'
import { formatBrowserUploadOversizedFileMessage } from '../../../shared/browserUploadPathFilter.ts'
import { sanitizeUploadRelativePath } from '../sources/uploadRelativePath.ts'
import { validateLocalProjectFolder } from '../sources/localFolderSource.ts'

export const BROWSER_UPLOAD_LIMITS = {
  maxTotalBytes: 150 * 1024 * 1024,
  maxFileBytes: 50 * 1024 * 1024,
  maxFiles: 4000,
} as const

export type BrowserUploadFilePart = {
  filename: string
  data: Buffer
}

export async function applyBrowserLocalFolderUpload(input: {
  uploadId?: string
  displayName?: string
  files: BrowserUploadFilePart[]
}): Promise<
  | { ok: true; localFolderPath: string; uploadId: string; fileCount: number; totalBytes: number }
  | { ok: false; code: string; message?: string }
> {
  const uploadId =
    input.uploadId && assertValidBrowserUploadSessionId(input.uploadId)
      ? input.uploadId.trim()
      : randomUUID()

  if (!assertValidBrowserUploadSessionId(uploadId)) {
    return { ok: false, code: 'INVALID_UPLOAD_ID' }
  }

  if (input.files.length === 0) {
    return { ok: false, code: 'EMPTY_UPLOAD', message: 'Nenhum arquivo recebido na pasta selecionada.' }
  }
  if (input.files.length > BROWSER_UPLOAD_LIMITS.maxFiles) {
    return { ok: false, code: 'TOO_MANY_FILES', message: 'A pasta excede o limite de arquivos para envio pelo navegador.' }
  }

  let totalBytes = 0
  const normalizedFiles: Array<{ relativePath: string; data: Buffer }> = []

  for (const file of input.files) {
    const sanitized = sanitizeUploadRelativePath(file.filename)
    if (!sanitized.ok) {
      if (sanitized.code === 'UPLOAD_PATH_SKIPPED') continue
      return { ok: false, code: sanitized.code, message: 'Caminho de arquivo inválido no upload.' }
    }
    totalBytes += file.data.length
    if (file.data.length > BROWSER_UPLOAD_LIMITS.maxFileBytes) {
      return {
        ok: false,
        code: 'FILE_TOO_LARGE',
        message: formatBrowserUploadOversizedFileMessage(sanitized.relativePath, file.data.length),
      }
    }
    if (totalBytes > BROWSER_UPLOAD_LIMITS.maxTotalBytes) {
      return {
        ok: false,
        code: 'BODY_TOO_LARGE',
        message: 'A pasta excede o tamanho total permitido para envio pelo navegador.',
      }
    }
    normalizedFiles.push({ relativePath: sanitized.relativePath, data: file.data })
  }

  if (normalizedFiles.length === 0) {
    return {
      ok: false,
      code: 'EMPTY_UPLOAD',
      message:
        'Nenhum arquivo útil encontrado após ignorar dependências, .git e artefatos de empacotamento (ex.: win-unpacked, instaladores).',
    }
  }

  const sessionDir = path.join(getBrowserUploadStagingRoot(), uploadId)
  const sessionResolved = path.resolve(sessionDir)
  const stagingRoot = path.resolve(getBrowserUploadStagingRoot())
  if (!isPathInsideRoot(stagingRoot, sessionResolved)) {
    return { ok: false, code: 'INVALID_UPLOAD_PATH' }
  }

  await fs.rm(sessionResolved, { recursive: true, force: true })
  await fs.mkdir(sessionResolved, { recursive: true })

  try {
    for (const file of normalizedFiles) {
      const target = path.join(sessionResolved, ...file.relativePath.split('/'))
      const targetResolved = path.resolve(target)
      if (!isPathInsideRoot(sessionResolved, targetResolved)) {
        throw new Error('INVALID_UPLOAD_PATH')
      }
      await fs.mkdir(path.dirname(targetResolved), { recursive: true })
      await fs.writeFile(targetResolved, file.data, { flag: 'wx' })
    }
  } catch {
    await fs.rm(sessionResolved, { recursive: true, force: true })
    return { ok: false, code: 'UPLOAD_WRITE_FAILED', message: 'Falha ao gravar arquivos enviados pelo navegador.' }
  }

  const validated = await validateLocalProjectFolder(sessionResolved)
  if (!validated.ok) {
    await fs.rm(sessionResolved, { recursive: true, force: true })
    return {
      ok: false,
      code: validated.code,
      message: 'A pasta enviada não parece um projeto válido (package.json ou server-manifest.json).',
    }
  }

  return {
    ok: true,
    localFolderPath: validated.absolutePath,
    uploadId,
    fileCount: normalizedFiles.length,
    totalBytes,
  }
}
