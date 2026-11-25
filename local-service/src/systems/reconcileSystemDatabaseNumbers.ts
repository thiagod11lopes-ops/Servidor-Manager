import fs from 'node:fs/promises'
import { loadServerManifest } from '../serverManifest/loadServerManifest.ts'
import { resolveServidorEnvPaths } from '../serverManifest/prepareServidorEnv.ts'
import type { ServerManifest } from '../serverManifest/types.ts'
import type { DiscoveredInstalledSystem } from './discoverInstalledSystems.ts'
import { publishSystemDatabaseNumber } from './publishSystemDatabaseNumber.ts'

function readEnvDatabaseNumber(content: string): string | null {
  const match = /^ACOMOPMS_DATABASE_NUMBER=(.+)$/m.exec(content)
  if (!match) return null
  const value = match[1].trim()
  return value.length > 0 ? value : null
}

async function envNeedsPublish(
  projectDirectory: string,
  manifest: ServerManifest,
  expectedCode: string,
): Promise<boolean> {
  const paths = resolveServidorEnvPaths(projectDirectory, manifest)
  try {
    const raw = await fs.readFile(paths.envPath, 'utf8')
    return readEnvDatabaseNumber(raw) !== expectedCode
  } catch {
    return true
  }
}

export async function reconcileSystemDatabaseNumbers(
  systems: DiscoveredInstalledSystem[],
  assignments: Record<string, string>,
): Promise<void> {
  for (const system of systems) {
    const databaseNumber = assignments[system.systemId]
    if (!databaseNumber || !system.projectDirectory) continue

    const loaded = await loadServerManifest(system.projectDirectory)
    if (!loaded.found || !loaded.ok) continue

    const needs = await envNeedsPublish(system.projectDirectory, loaded.manifest, databaseNumber)
    if (!needs) continue

    await publishSystemDatabaseNumber({
      projectDirectory: system.projectDirectory,
      manifest: loaded.manifest,
      databaseNumber,
    })
  }
}
