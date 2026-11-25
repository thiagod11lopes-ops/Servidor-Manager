import fs from 'node:fs/promises'
import { getServerManifestStatePath } from '../installation/paths.ts'

export type ServerManifestStateFile = {
  profile?: string
  status?: string
  sourceUrl?: string
  rootDirectory?: string
  servidorEnv?: {
    httpPort?: number
    lanHost?: string
    path?: string
  }
  serverConnection?: {
    loginUrl?: string
    publicOrigin?: string
  }
}

export async function readServerManifestState(systemId: string): Promise<ServerManifestStateFile | null> {
  try {
    const raw = await fs.readFile(getServerManifestStatePath(systemId), 'utf8')
    return JSON.parse(raw) as ServerManifestStateFile
  } catch {
    return null
  }
}
