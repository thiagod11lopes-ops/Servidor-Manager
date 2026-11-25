import type { PostgresClient } from './postgresClient.ts'
import { windowsPostgresClient } from './windows/postgresClient.ts'

export function getPostgresClient(): PostgresClient {
  if (process.platform === 'win32') {
    return windowsPostgresClient
  }
  throw new Error('UNSUPPORTED_PLATFORM')
}
