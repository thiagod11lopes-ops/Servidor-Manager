import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const FILE_NAME = 'omps-lan-discovery-instance.json'

export async function getOrCreateOmpsLanDiscoveryInstanceId(systemRoot: string): Promise<string> {
  const filePath = path.join(systemRoot, FILE_NAME)
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as { instanceId?: unknown }
    if (typeof raw.instanceId === 'string' && raw.instanceId.trim()) {
      return raw.instanceId.trim()
    }
  } catch {
    // cria abaixo
  }
  const instanceId = randomUUID()
  await fs.writeFile(
    filePath,
    JSON.stringify({ schema: 'omps-lan-discovery-instance/1', instanceId, createdAt: new Date().toISOString() }, null, 2),
    'utf8',
  )
  return instanceId
}
