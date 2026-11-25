import fs from 'node:fs/promises'
import type { DatabaseProvisioningRecord } from './provisioning/types.ts'
import type { SystemDatabaseAnalysis } from './types/databaseTypes.ts'
import { getDatabaseProfilePath } from './databasePaths.ts'

export type DatabaseProfileDocument = {
  version: 2
  systemId: string
  analysis: SystemDatabaseAnalysis
  provisioning?: DatabaseProvisioningRecord
  updatedAt: string
}

export async function readDatabaseProfile(systemId: string): Promise<DatabaseProfileDocument | null> {
  try {
    const raw = await fs.readFile(getDatabaseProfilePath(systemId), 'utf8')
    const parsed = JSON.parse(raw) as DatabaseProfileDocument | SystemDatabaseAnalysis

    if ('version' in parsed && parsed.version === 2) {
      return parsed as DatabaseProfileDocument
    }

    const legacy = parsed as SystemDatabaseAnalysis
    if (legacy.systemId) {
      return {
        version: 2,
        systemId: legacy.systemId,
        analysis: legacy,
        updatedAt: new Date().toISOString(),
      }
    }

    return null
  } catch {
    return null
  }
}

export async function writeDatabaseProfile(document: DatabaseProfileDocument): Promise<void> {
  await fs.writeFile(getDatabaseProfilePath(document.systemId), JSON.stringify(document, null, 2), 'utf8')
}
