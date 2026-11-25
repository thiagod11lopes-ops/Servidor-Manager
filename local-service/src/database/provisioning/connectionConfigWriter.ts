import fs from 'node:fs/promises'
import path from 'node:path'
import { getSystemRoot } from '../../installation/paths.ts'
import type { DatabaseProvisioningRecord } from './types.ts'

export async function writeConnectionConfig(
  systemId: string,
  record: DatabaseProvisioningRecord,
): Promise<void> {
  const configDir = path.join(getSystemRoot(systemId), 'config')
  await fs.mkdir(configDir, { recursive: true })

  const lines = [
    '# Gerado pelo Servidor Manager — não inclui senha em texto aberto.',
    `DATABASE_HOST=${record.host}`,
    `DATABASE_PORT=${record.port}`,
    `DATABASE_NAME=${record.databaseName}`,
    `DATABASE_USER=${record.databaseUser}`,
    record.passwordStoredSecurely && record.credentialKey
      ? `# DATABASE_PASSWORD: armazenada com DPAPI (${record.credentialKey})`
      : '# DATABASE_PASSWORD: não armazenada — configure manualmente ou reprovisione.',
    '',
  ]

  await fs.writeFile(path.join(configDir, 'database.env'), lines.join('\n'), 'utf8')
}
