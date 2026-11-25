import fs from 'node:fs/promises'
import path from 'node:path'
import { monitoringFile } from './paths.ts'

type CacheEntry = {
  bytes: number
  partial: boolean
  measuredAt: string
  detail: string | null
}

type SizeCacheFile = {
  version: 1
  entries: Record<string, CacheEntry>
}

const CACHE_TTL_MS = 45_000
const MAX_FILES = 25_000
const MAX_DEPTH = 12

let memoryCache: { loadedAt: number; file: SizeCacheFile } | null = null

async function loadCache(): Promise<SizeCacheFile> {
  const now = Date.now()
  if (memoryCache && now - memoryCache.loadedAt < 5_000) {
    return memoryCache.file
  }
  try {
    const raw = await fs.readFile(monitoringFile('directory-size-cache.json'), 'utf8')
    const parsed = JSON.parse(raw) as SizeCacheFile
    if (parsed.version === 1 && parsed.entries) {
      memoryCache = { loadedAt: now, file: parsed }
      return parsed
    }
  } catch {
    // ignore
  }
  const empty: SizeCacheFile = { version: 1, entries: {} }
  memoryCache = { loadedAt: now, file: empty }
  return empty
}

async function saveCache(file: SizeCacheFile): Promise<void> {
  memoryCache = { loadedAt: Date.now(), file }
  await fs.mkdir(path.dirname(monitoringFile('directory-size-cache.json')), { recursive: true })
  await fs.writeFile(monitoringFile('directory-size-cache.json'), JSON.stringify(file, null, 2), 'utf8')
}

async function walkDirectorySize(root: string, depth: number, state: { files: number; bytes: number; partial: boolean }) {
  if (depth > MAX_DEPTH || state.files >= MAX_FILES) {
    state.partial = true
    return
  }
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    state.partial = true
    return
  }
  for (const entry of entries) {
    if (state.files >= MAX_FILES) {
      state.partial = true
      return
    }
    const full = path.join(root, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      await walkDirectorySize(full, depth + 1, state)
    } else if (entry.isFile()) {
      state.files += 1
      try {
        const stat = await fs.stat(full)
        state.bytes += stat.size
      } catch {
        state.partial = true
      }
    }
  }
}

export async function measureDirectoryBytes(
  targetPath: string,
  options?: { force?: boolean },
): Promise<{ bytes: number | null; partial: boolean; measuredAt: string | null; detail: string | null }> {
  const resolved = path.resolve(targetPath)
  const cache = await loadCache()
  const existing = cache.entries[resolved]
  const now = Date.now()
  if (!options?.force && existing && now - Date.parse(existing.measuredAt) < CACHE_TTL_MS) {
    return {
      bytes: existing.bytes,
      partial: existing.partial,
      measuredAt: existing.measuredAt,
      detail: existing.detail,
    }
  }

  try {
    await fs.access(resolved)
  } catch {
    return { bytes: null, partial: false, measuredAt: null, detail: 'Diretório não encontrado.' }
  }

  const state = { files: 0, bytes: 0, partial: false }
  await walkDirectorySize(resolved, 0, state)
  const measuredAt = new Date().toISOString()
  const detail = state.partial
    ? `Medição parcial (${state.files}+ arquivos; limite ${MAX_FILES}).`
    : `${state.files} arquivos medidos.`

  cache.entries[resolved] = { bytes: state.bytes, partial: state.partial, measuredAt, detail }
  await saveCache(cache)

  return { bytes: state.bytes, partial: state.partial, measuredAt, detail }
}
