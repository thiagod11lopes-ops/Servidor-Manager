import type { PostgresAdminCredentials } from '../provisioning/types.ts'

export type PostgresClient = {
  runAdminQuery(
    credentials: PostgresAdminCredentials,
    sql: string,
  ): Promise<{ ok: true; stdout: string } | { ok: false; code: string }>
}
