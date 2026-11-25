import { collectFilesFromDirectoryHandle } from './walkDirectoryHandle.ts'
import { uploadBrowserProjectFolder } from './uploadBrowserProjectFolder.ts'

export type PickLocalFolderResult =
  | { ok: true; path: string; label?: string; source?: 'electron' | 'browser' }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string }

declare global {
  interface Window {
    servidorManager?: {
      pickProjectFolder(): Promise<PickLocalFolderResult>
      packagedProduct?: {
        bundledOmps?: boolean
      }
    }
    showDirectoryPicker?: (options?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandle>
  }
}

function browserPickerUnavailableMessage(): string {
  const secure =
    typeof window !== 'undefined' &&
    (window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1')
  if (!secure) {
    return 'Seleção de pasta pelo navegador exige contexto seguro (http://127.0.0.1:5199/).'
  }
  if (typeof window.showDirectoryPicker !== 'function') {
    return 'Seu navegador não suporta seleção de pasta. Use Chrome ou Edge recente, ou o aplicativo Electron quando disponível.'
  }
  return 'Não foi possível abrir o seletor de pasta.'
}

async function pickLocalFolderViaBrowser(): Promise<PickLocalFolderResult> {
  if (typeof window.showDirectoryPicker !== 'function') {
    return { ok: false, cancelled: false, message: browserPickerUnavailableMessage() }
  }

  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker({ mode: 'read' })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'AbortError') {
      return { ok: false, cancelled: true }
    }
    return {
      ok: false,
      cancelled: false,
      message:
        name === 'SecurityError'
          ? 'Permissão negada para ler a pasta selecionada.'
          : browserPickerUnavailableMessage(),
    }
  }

  const entries = await collectFilesFromDirectoryHandle(handle)
  const uploaded = await uploadBrowserProjectFolder({
    displayName: handle.name,
    entries,
  })

  if (!uploaded.ok) {
    return { ok: false, cancelled: false, message: uploaded.message }
  }

  return {
    ok: true,
    path: uploaded.localFolderPath,
    label: handle.name,
    source: 'browser',
  }
}

export async function pickLocalProjectFolder(): Promise<PickLocalFolderResult> {
  if (window.servidorManager?.pickProjectFolder) {
    const picked = await window.servidorManager.pickProjectFolder()
    if (picked.ok) {
      return { ...picked, source: 'electron' }
    }
    return picked
  }

  return pickLocalFolderViaBrowser()
}
