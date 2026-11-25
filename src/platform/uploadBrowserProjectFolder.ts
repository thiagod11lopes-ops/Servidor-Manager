import { formatBrowserUploadOversizedFileMessage } from '../../shared/browserUploadPathFilter.ts'
import { getLocalServiceBaseUrl } from '../services/localServiceConfig.ts'
import type { DirectoryWalkEntry } from './walkDirectoryHandle.ts'

export const BROWSER_FOLDER_UPLOAD_LIMITS = {
  maxTotalBytes: 150 * 1024 * 1024,
  maxFileBytes: 50 * 1024 * 1024,
  maxFiles: 4000,
} as const

export type BrowserFolderUploadResult =
  | {
      ok: true
      localFolderPath: string
      uploadId: string
      fileCount: number
      totalBytes: number
      displayName?: string
    }
  | { ok: false; message: string }

function validateCollectedFiles(entries: DirectoryWalkEntry[]): string | null {
  if (entries.length === 0) {
    return 'A pasta selecionada está vazia ou só contém itens ignorados (dependências, .git, artefatos de empacotamento como win-unpacked/.exe).'
  }
  if (entries.length > BROWSER_FOLDER_UPLOAD_LIMITS.maxFiles) {
    return 'A pasta excede o limite de arquivos para envio pelo navegador.'
  }
  let total = 0
  for (const entry of entries) {
    if (entry.file.size > BROWSER_FOLDER_UPLOAD_LIMITS.maxFileBytes) {
      return formatBrowserUploadOversizedFileMessage(entry.relativePath, entry.file.size)
    }
    total += entry.file.size
    if (total > BROWSER_FOLDER_UPLOAD_LIMITS.maxTotalBytes) {
      return 'A pasta excede o tamanho total permitido para envio pelo navegador.'
    }
  }
  return null
}

export async function uploadBrowserProjectFolder(input: {
  displayName: string
  entries: DirectoryWalkEntry[]
  uploadId?: string
}): Promise<BrowserFolderUploadResult> {
  const validationError = validateCollectedFiles(input.entries)
  if (validationError) {
    return { ok: false, message: validationError }
  }

  const uploadId = input.uploadId ?? crypto.randomUUID()
  const form = new FormData()
  form.append('uploadId', uploadId)
  form.append('displayName', input.displayName)
  for (const entry of input.entries) {
    form.append('files', entry.file, entry.relativePath.replace(/\\/g, '/'))
  }

  const baseUrl = getLocalServiceBaseUrl()
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/v1/projects/local-folder/browser-upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(900_000),
    })
  } catch {
    return {
      ok: false,
      message:
        'Não foi possível enviar a pasta ao serviço local (47831). Verifique se o Servidor Manager está aberto.',
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, message: 'Resposta inválida do serviço local ao enviar a pasta.' }
  }

  if (
    payload &&
    typeof payload === 'object' &&
    (payload as { ok?: unknown }).ok === true &&
    typeof (payload as { localFolderPath?: unknown }).localFolderPath === 'string'
  ) {
    const body = payload as {
      localFolderPath: string
      uploadId?: string
      fileCount?: number
      totalBytes?: number
    }
    return {
      ok: true,
      localFolderPath: body.localFolderPath,
      uploadId: typeof body.uploadId === 'string' ? body.uploadId : uploadId,
      fileCount: typeof body.fileCount === 'number' ? body.fileCount : input.entries.length,
      totalBytes:
        typeof body.totalBytes === 'number'
          ? body.totalBytes
          : input.entries.reduce((sum, entry) => sum + entry.file.size, 0),
      displayName: input.displayName,
    }
  }

  const message =
    payload &&
    typeof payload === 'object' &&
    typeof (payload as { message?: unknown }).message === 'string'
      ? (payload as { message: string }).message
      : 'Falha ao enviar a pasta selecionada.'
  return { ok: false, message }
}
