import fs from 'node:fs/promises'
import path from 'node:path'
import { prepareServidorEnv } from '../serverManifest/prepareServidorEnv.ts'
import type { ServerManifest } from '../serverManifest/types.ts'
import { ensureAcompDatabaseNumberUiSupport } from './ensureAcompDatabaseNumberUiSupport.ts'

const SERVER_CONNECTION_FILENAME = 'server-connection.json'
const MAX_SEARCH_DEPTH = 6

async function findServerConnectionJsonFiles(rootDirectory: string): Promise<string[]> {
  const found: string[] = []
  const queue: { dir: string; depth: number }[] = [{ dir: rootDirectory, depth: 0 }]
  const skipDirNames = new Set(['node_modules', '.git', '.supabase'])

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    if (current.depth > MAX_SEARCH_DEPTH) continue

    let entries: { name: string; isDirectory: () => boolean }[]
    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current.dir, entry.name)
      if (entry.isDirectory()) {
        if (skipDirNames.has(entry.name)) continue
        queue.push({ dir: fullPath, depth: current.depth + 1 })
        continue
      }
      if (entry.name === SERVER_CONNECTION_FILENAME) {
        found.push(fullPath)
      }
    }
  }

  return found
}

async function mergeDatabaseNumberIntoServerConnection(
  filePath: string,
  databaseNumber: string,
): Promise<boolean> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch {
    return false
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return false
  }

  if (parsed.databaseNumber === databaseNumber) return false

  parsed.databaseNumber = databaseNumber
  await fs.writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  return true
}

export async function publishSystemDatabaseNumber(input: {
  projectDirectory: string
  manifest: ServerManifest
  databaseNumber: string
}): Promise<{ envUpdated: boolean; connectionFilesUpdated: number }> {
  const envResult = await prepareServidorEnv({
    rootDirectory: input.projectDirectory,
    manifest: input.manifest,
    databaseNumber: input.databaseNumber,
  })

  let connectionFilesUpdated = 0
  if (envResult.ok) {
    const files = await findServerConnectionJsonFiles(input.projectDirectory)
    for (const filePath of files) {
      const updated = await mergeDatabaseNumberIntoServerConnection(filePath, input.databaseNumber)
      if (updated) connectionFilesUpdated += 1
    }
  }

  if (envResult.ok) {
    await ensureAcompDatabaseNumberUiSupport(input.projectDirectory)
  }

  return {
    envUpdated: envResult.ok,
    connectionFilesUpdated,
  }
}
