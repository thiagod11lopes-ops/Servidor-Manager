import fs from 'node:fs/promises'
import path from 'node:path'
import { getSystemRoot } from '../installation/paths.ts'

export type OmpsSystemPortsRecord = {
  version: 1
  httpPort: number
  recordedAt: string
}

function recordPath(systemId: string): string {
  return path.join(getSystemRoot(systemId), 'omps-system-ports.json')
}

export async function readOmpsSystemPortsRecord(
  systemId: string,
): Promise<OmpsSystemPortsRecord | null> {
  try {
    const raw = JSON.parse(await fs.readFile(recordPath(systemId), 'utf8')) as OmpsSystemPortsRecord
    if (raw.version !== 1 || typeof raw.httpPort !== 'number') return null
    if (raw.httpPort < 1 || raw.httpPort > 65535) return null
    return raw
  } catch {
    return null
  }
}

export async function writeOmpsSystemHttpPort(systemId: string, httpPort: number): Promise<void> {
  const record: OmpsSystemPortsRecord = {
    version: 1,
    httpPort,
    recordedAt: new Date().toISOString(),
  }
  const filePath = recordPath(systemId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8')
}
