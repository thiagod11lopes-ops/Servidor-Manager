/**
 * Regras compartilhadas (UI + local-service) para upload de pasta pelo navegador.
 * Não alteram a pasta original — só o conjunto enviado ao staging.
 *
 * Preserva `dist/` de apps (Vite etc.) e exclui artefatos típicos de empacotamento
 * (electron-builder win-unpacked, instaladores, arquivos compactados).
 */

/** Pastas ignoradas em qualquer nível da árvore. */
export const BROWSER_UPLOAD_SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.cache',
  '.turbo',
  '.next',
  '.nuxt',
  'coverage',
  '.venv',
  'venv',
  '.pnpm-store',
  '.yarn',
  'bower_components',
  '.supabase',
])

/** Segmentos de caminho que indicam saída de empacotador, não fonte instalável pelo Manager. */
export const BROWSER_UPLOAD_SKIP_PATH_SEGMENTS = new Set([
  'win-unpacked',
  'linux-unpacked',
  'mac-unpacked',
])

/** Extensões de distribuição / binários — não usadas pelo fluxo manifest/npm install. */
export const BROWSER_UPLOAD_SKIP_FILE_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.dmg',
  '.pkg',
  '.deb',
  '.rpm',
  '.app',
  '.asar',
  '.zip',
  '.7z',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.iso',
  '.map',
])

export function normalizeUploadRelativePath(raw: string): string {
  let normalized = raw.replace(/\\/g, '/').trim()
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }
  return normalized.replace(/^\/+/, '')
}

export function splitUploadRelativePath(relativePath: string): string[] {
  return normalizeUploadRelativePath(relativePath)
    .split('/')
    .filter((segment) => segment.length > 0)
}

export function shouldSkipBrowserUploadPath(
  relativePath: string,
  kind: 'file' | 'directory' = 'file',
): boolean {
  const segments = splitUploadRelativePath(relativePath)
  if (segments.length === 0) return true

  for (const segment of segments) {
    if (segment === '..') return true
    if (BROWSER_UPLOAD_SKIP_DIR_NAMES.has(segment)) return true
    if (BROWSER_UPLOAD_SKIP_PATH_SEGMENTS.has(segment)) return true
  }

  if (kind === 'directory') {
    const dirName = segments[segments.length - 1]
    return (
      BROWSER_UPLOAD_SKIP_DIR_NAMES.has(dirName) || BROWSER_UPLOAD_SKIP_PATH_SEGMENTS.has(dirName)
    )
  }

  const fileName = segments[segments.length - 1]
  const dot = fileName.lastIndexOf('.')
  if (dot > 0) {
    const ext = fileName.slice(dot).toLowerCase()
    if (BROWSER_UPLOAD_SKIP_FILE_EXTENSIONS.has(ext)) return true
  }

  return false
}

/** Ignorar ao descer na árvore (File System Access API). */
export function shouldSkipBrowserUploadDirectoryName(dirName: string): boolean {
  return (
    BROWSER_UPLOAD_SKIP_DIR_NAMES.has(dirName) || BROWSER_UPLOAD_SKIP_PATH_SEGMENTS.has(dirName)
  )
}

export function formatBrowserUploadOversizedFileMessage(relativePath: string, sizeBytes: number): string {
  const mb = (sizeBytes / (1024 * 1024)).toFixed(1)
  return (
    `O arquivo "${relativePath}" (${mb} MB) excede o limite por arquivo no envio pelo navegador. ` +
    'Artefatos de instalador ou empacotamento aninhados (ex.: dist/win-unpacked, .exe) são ignorados automaticamente; ' +
    'se este arquivo for indispensável ao projeto, use o seletor Electron (copia do disco) ou instale via Git.'
  )
}
